import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Category and document-type IDs are now resolved per-tenant at request time
// (was hardcoded for the In-Sync tenant — broke for any other org).
const CATEGORY_NAMES = ["Supplier", "Service Provider", "Contractor", "Channel Partner"];
const DOC_TYPE_NAMES = [
  "GST Registration Certificate",
  "PAN Card",
  "Certificate of Incorporation",
  "Cancelled Cheque",
];

const SALUTATIONS = ["Mr", "Mrs", "Ms", "Dr"];
const CONSTITUTIONS = ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited"];
const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank"];
const IFSCS = ["SBIN0001234", "HDFC0002345", "ICIC0003456", "UTIB0004567", "KKBK0005678"];

const REJECTION_REASONS = [
  "Incomplete documentation submitted",
  "PAN number does not match company records",
  "GST certificate expired",
  "Bank details verification failed",
  "Company registration not found in MCA records",
];

const SENT_BACK_REASONS = [
  "Please upload a clearer copy of your PAN card",
  "GST certificate is not legible, please re-upload",
  "Bank account details do not match the cancelled cheque",
  "Certificate of Incorporation is missing pages",
  "Please provide updated address proof",
];

const DOC_REVIEW_COMMENTS = [
  "Blurry image - cannot read details",
  "Wrong document uploaded",
  "Document is expired",
  "Name mismatch with vendor records",
  "Partially cropped - important fields not visible",
  "Watermark obscures critical information",
];

const PII_COLUMNS = [
  "pan_number", "gst_number", "cin_number",
  "bank_account_number", "bank_ifsc",
  "primary_mobile", "primary_email",
  "secondary_mobile", "nominee_contact",
];

const PII_PURPOSES = ["display", "verification", "export", "audit_review", "compliance_check"];

interface SeedContext {
  tenantId: string;
  staffUserId: string;
  categoryIds: string[]; // length 4, ordered same as CATEGORY_NAMES
  docTypeIds: string[];  // length 4, ordered same as DOC_TYPE_NAMES
}

// ── Helpers ────────────────────────────────────────────────────
const pad = (n: number, len = 4) => String(n).padStart(len, "0");

function buildVendor(n: number, group: number, ctx: SeedContext) {
  const base: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    company_name: `StressTest Corp #${n}`,
    trade_name: `ST Trading #${n}`,
    category_id: ctx.categoryIds[(n - 1) % 4],
    primary_contact_name: `Contact Person #${n}`,
    primary_mobile: `9${pad(n, 9)}`,
    primary_email: `vendor${n}@stresstest.in`,
    salutation: SALUTATIONS[(n - 1) % 4],
    constitution_type: CONSTITUTIONS[(n - 1) % 5],
    registered_address: `${n} Test Street, Mumbai, Maharashtra 400001`,
    operational_address: `${n} Operations Lane, Pune, Maharashtra 411001`,
    referred_by: ctx.staffUserId,
  };

  // Full PII (all groups except Group 2 which is partial)
  const fullPii = group !== 2;
  base.pan_number = `ABCDE${pad(n)}F`;
  if (fullPii) {
    base.gst_number = `27ABCDE${pad(n)}F1Z5`;
    base.cin_number = `U12345MH2020PTC${pad(n, 6)}`;
    base.bank_account_number = `90000000${pad(n, 5)}`;
    base.bank_ifsc = IFSCS[(n - 1) % 5];
    base.bank_name = BANKS[(n - 1) % 5];
    base.bank_branch = `Branch #${n}`;
    base.secondary_contact_name = `Secondary Contact #${n}`;
    base.secondary_mobile = `8${pad(n, 9)}`;
    base.nominee_name = `Nominee #${n}`;
    base.nominee_contact = `7${pad(n, 9)}`;
  }

  // Group-specific overrides
  switch (group) {
    case 1: // Happy Path - approved
      base.current_status = "approved";
      base.submitted_at = new Date(Date.now() - 30 * 86400000).toISOString();
      base.approved_at = new Date(Date.now() - 15 * 86400000).toISOString();
      base.vendor_code = `VND-${pad(n, 6)}`;
      break;
    case 2: // Partial PII - pending_review
      base.current_status = "pending_review";
      base.submitted_at = new Date(Date.now() - 5 * 86400000).toISOString();
      break;
    case 3: // Rejected
      base.current_status = "rejected";
      base.submitted_at = new Date(Date.now() - 20 * 86400000).toISOString();
      base.rejected_at = new Date(Date.now() - 10 * 86400000).toISOString();
      base.rejection_reason = REJECTION_REASONS[(n - 1) % 5];
      break;
    case 4: // Sent back
      base.current_status = "sent_back";
      base.submitted_at = new Date(Date.now() - 12 * 86400000).toISOString();
      base.sent_back_reason = SENT_BACK_REASONS[(n - 1) % 5];
      break;
    case 5: // Pending approval (older)
      base.current_status = "pending_approval";
      base.submitted_at = new Date(Date.now() - 7 * 86400000).toISOString();
      break;
    case 6: // Pending approval
      base.current_status = "pending_approval";
      base.submitted_at = new Date(Date.now() - 10 * 86400000).toISOString();
      break;
    case 7: // Draft
      base.current_status = "draft";
      break;
    case 8: // Expiring docs - approved
      base.current_status = "approved";
      base.submitted_at = new Date(Date.now() - 60 * 86400000).toISOString();
      base.approved_at = new Date(Date.now() - 45 * 86400000).toISOString();
      base.vendor_code = `VND-${pad(n, 6)}`;
      break;
    case 9: // Consent withdrawn
      base.current_status = "consent_withdrawn";
      base.submitted_at = new Date(Date.now() - 40 * 86400000).toISOString();
      base.approved_at = new Date(Date.now() - 30 * 86400000).toISOString();
      break;
    case 10: // Fraud / duplicates
      base.current_status = "pending_review";
      base.submitted_at = new Date(Date.now() - 3 * 86400000).toISOString();
      break;
  }

  return base;
}

function buildDocs(vendorId: string, vendorN: number, group: number, ctx: SeedContext) {
  const now = Date.now();
  const docs: Record<string, unknown>[] = [];

  // Group 7 (draft) only gets 1-2 docs
  const docCount = group === 7 ? (vendorN % 2 === 0 ? 2 : 1) : 4;

  for (let d = 0; d < docCount; d++) {
    const doc: Record<string, unknown> = {
      tenant_id: ctx.tenantId,
      vendor_id: vendorId,
      document_type_id: ctx.docTypeIds[d],
      file_url: `seed/vendor_${vendorN}/${["gst", "pan", "coi", "cheque"][d]}.pdf`,
      file_name: `${["gst_certificate", "pan_card", "certificate_of_incorporation", "cancelled_cheque"][d]}.pdf`,
      file_size_bytes: 100000 + Math.floor(Math.random() * 1900000),
      version_number: 1,
    };

    // Status based on group
    switch (group) {
      case 1: // approved
      case 6: // pending approval - docs approved
      case 8: // expiring docs - approved
      case 9: // consent withdrawn
        doc.status = "approved";
        doc.reviewed_by = ctx.staffUserId;
        doc.reviewed_at = new Date(now - 14 * 86400000).toISOString();
        break;
      case 2: // uploaded
        doc.status = "uploaded";
        break;
      case 3: // mix of approved and rejected
        doc.status = d % 2 === 0 ? "approved" : "rejected";
        if (d % 2 !== 0) {
          doc.review_comments = DOC_REVIEW_COMMENTS[d % 6];
          doc.reviewed_by = ctx.staffUserId;
          doc.reviewed_at = new Date(now - 10 * 86400000).toISOString();
        } else {
          doc.reviewed_by = ctx.staffUserId;
          doc.reviewed_at = new Date(now - 12 * 86400000).toISOString();
        }
        break;
      case 4: // some rejected with comments
        doc.status = d < 2 ? "uploaded" : "rejected";
        if (d >= 2) {
          doc.review_comments = DOC_REVIEW_COMMENTS[(vendorN + d) % 6];
          doc.reviewed_by = ctx.staffUserId;
          doc.reviewed_at = new Date(now - 8 * 86400000).toISOString();
        }
        break;
      case 5: // under_review
        doc.status = "under_review";
        break;
      case 7: // draft - uploaded
        doc.status = "uploaded";
        break;
      case 10: // fraud - uploaded
        doc.status = "uploaded";
        break;
    }

    // Expiry dates for Group 8
    if (group === 8) {
      if (d === 0) doc.expiry_date = new Date(now + 5 * 86400000).toISOString().split("T")[0]; // 5 days
      else if (d === 1) doc.expiry_date = new Date(now + 7 * 86400000).toISOString().split("T")[0]; // 7 days
      else if (d === 2) doc.expiry_date = new Date(now + 28 * 86400000).toISOString().split("T")[0]; // 28 days
      else doc.expiry_date = new Date(now - 10 * 86400000).toISOString().split("T")[0]; // expired
    }

    docs.push(doc);
  }
  return docs;
}

function applyFraudOverrides(vendors: Record<string, unknown>[], startN: number) {
  // Vendors 86-90 (index 0-4): duplicate PAN
  for (let i = 0; i < 5 && i < vendors.length; i++) {
    vendors[i].pan_number = "DUPAN1234F";
    vendors[i].company_name = `DupPAN Corp #${startN + i}`;
  }
  // Vendors 91-95 (index 5-9): duplicate GST
  for (let i = 5; i < 10 && i < vendors.length; i++) {
    vendors[i].gst_number = "27DUPAN1234F1Z5";
    vendors[i].company_name = `DupGST Corp #${startN + i}`;
  }
  // Vendors 96-98 (index 10-12): duplicate bank
  for (let i = 10; i < 13 && i < vendors.length; i++) {
    vendors[i].bank_account_number = "9999999999999";
    vendors[i].company_name = `DupBank Corp #${startN + i}`;
  }
  // Vendors 99-100 (index 13-14): similar names
  if (vendors.length > 13) vendors[13].company_name = "Capital Trading Enterprises";
  if (vendors.length > 14) vendors[14].company_name = "Capitol Trading Enterprise";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const clean = url.searchParams.get("clean") === "true";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth: require admin caller, scope all work to caller's tenant ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerTenantId } = await supabase.rpc("get_user_tenant_id", { _user_id: caller.id });
    if (!callerTenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found for caller" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tenantId: string = callerTenantId;

    // ── Cleanup mode ─────────────────────────────────────────
    if (clean) {
      // Get all stress test vendor IDs (scoped to caller's tenant)
      const { data: stVendors } = await supabase
        .from("vendors")
        .select("id")
        .eq("tenant_id", tenantId)
        .or(
          "company_name.like.StressTest Corp%,company_name.like.DupPAN Corp%,company_name.like.DupGST Corp%,company_name.like.DupBank Corp%,company_name.eq.Capital Trading Enterprises,company_name.eq.Capitol Trading Enterprise"
        );

      const vendorIds = (stVendors || []).map((v: { id: string }) => v.id);

      if (vendorIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No stress test data found to clean" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Delete in order: docs, consent, pii_access_log, workflow_history, workflow_assignments, vendors
      const { count: docsDeleted } = await supabase
        .from("vendor_documents")
        .delete({ count: "exact" })
        .in("vendor_id", vendorIds);

      const { count: consentDeleted } = await supabase
        .from("consent_records")
        .delete({ count: "exact" })
        .in("vendor_id", vendorIds);

      const { count: piiLogsDeleted } = await supabase
        .from("pii_access_log")
        .delete({ count: "exact" })
        .in("vendor_id", vendorIds);

      const { count: historyDeleted } = await supabase
        .from("workflow_history")
        .delete({ count: "exact" })
        .in("vendor_id", vendorIds);

      const { count: assignmentsDeleted } = await supabase
        .from("workflow_assignments")
        .delete({ count: "exact" })
        .in("vendor_id", vendorIds);

      const { count: vendorsDeleted } = await supabase
        .from("vendors")
        .delete({ count: "exact" })
        .in("id", vendorIds);

      return new Response(
        JSON.stringify({
          cleaned: true,
          vendors_deleted: vendorsDeleted,
          documents_deleted: docsDeleted,
          consent_deleted: consentDeleted,
          pii_logs_deleted: piiLogsDeleted,
          history_deleted: historyDeleted,
          assignments_deleted: assignmentsDeleted,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Idempotency check ────────────────────────────────────
    const { count: existing } = await supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .like("company_name", "StressTest Corp%");

    if (existing && existing > 0) {
      return new Response(
        JSON.stringify({
          message: `Already seeded (${existing} StressTest vendors found). Use ?clean=true to remove first.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve per-tenant category and document_type IDs by name ──
    const { data: cats } = await supabase
      .from("vendor_categories")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("name", CATEGORY_NAMES);
    const categoryIds = CATEGORY_NAMES.map((n) => cats?.find((c: { name: string }) => c.name === n)?.id);
    if (categoryIds.some((id) => !id)) {
      return new Response(
        JSON.stringify({ error: "Tenant is missing one or more default categories", missing: CATEGORY_NAMES.filter((_, i) => !categoryIds[i]) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: docTypes } = await supabase
      .from("document_types")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("name", DOC_TYPE_NAMES);
    const docTypeIds = DOC_TYPE_NAMES.map((n) => docTypes?.find((d: { name: string }) => d.name === n)?.id);
    if (docTypeIds.some((id) => !id)) {
      return new Response(
        JSON.stringify({ error: "Tenant is missing one or more default document types", missing: DOC_TYPE_NAMES.filter((_, i) => !docTypeIds[i]) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ctx: SeedContext = {
      tenantId,
      staffUserId: caller.id,
      categoryIds: categoryIds as string[],
      docTypeIds: docTypeIds as string[],
    };

    // ── Seed vendors in 10 groups ────────────────────────────
    const allVendorIds: string[] = [];
    const allDocs: Record<string, unknown>[] = [];
    const allConsent: Record<string, unknown>[] = [];
    const statusCounts: Record<string, number> = {};
    let totalDocsInserted = 0;

    for (let group = 1; group <= 10; group++) {
      const groupSize = group === 9 ? 5 : group === 10 ? 15 : 10;
      const startN =
        group <= 8
          ? (group - 1) * 10 + 1
          : group === 9
          ? 81
          : 86;

      const vendorBatch: Record<string, unknown>[] = [];
      for (let i = 0; i < groupSize; i++) {
        const n = startN + i;
        vendorBatch.push(buildVendor(n, group, ctx));
      }

      // Apply fraud overrides for group 10
      if (group === 10) {
        applyFraudOverrides(vendorBatch, startN);
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("vendors")
        .insert(vendorBatch)
        .select("id");

      if (insertErr) {
        throw new Error(`Group ${group} vendor insert failed: ${insertErr.message}`);
      }

      const ids = (inserted || []).map((v: { id: string }) => v.id);
      allVendorIds.push(...ids);

      // Count statuses
      for (const v of vendorBatch) {
        const s = v.current_status as string;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }

      // Build documents for each vendor in this group
      for (let i = 0; i < ids.length; i++) {
        const n = startN + i;
        const docs = buildDocs(ids[i], n, group, ctx);
        allDocs.push(...docs);
      }

      // Build consent records
      for (let i = 0; i < ids.length; i++) {
        const n = startN + i;
        const consent: Record<string, unknown> = {
          tenant_id: tenantId,
          vendor_id: ids[i],
          user_identifier: `vendor${n}@stresstest.in`,
          purpose: "vendor_onboarding",
          consent_version: "1.0",
          ip_address: `192.168.1.${(n % 254) + 1}`,
          user_agent: "StressTest/1.0",
        };
        // Consent withdrawn for group 9
        if (group === 9) {
          consent.withdrawn_at = new Date(Date.now() - 5 * 86400000).toISOString();
        }
        allConsent.push(consent);
      }
    }

    // ── Insert documents in batches of 100 ───────────────────
    for (let i = 0; i < allDocs.length; i += 100) {
      const batch = allDocs.slice(i, i + 100);
      const { error } = await supabase.from("vendor_documents").insert(batch);
      if (error) throw new Error(`Doc batch ${i} failed: ${error.message}`);
      totalDocsInserted += batch.length;
    }

    // ── Insert consent records in batches of 50 ──────────────
    for (let i = 0; i < allConsent.length; i += 50) {
      const batch = allConsent.slice(i, i + 50);
      const { error } = await supabase.from("consent_records").insert(batch);
      if (error) throw new Error(`Consent batch ${i} failed: ${error.message}`);
    }

    // ── Insert PII access logs (50 entries) ──────────────────
    const piiLogs: Record<string, unknown>[] = [];
    for (let i = 0; i < 50; i++) {
      const vendorIdx = i % allVendorIds.length;
      const daysAgo = Math.floor(Math.random() * 30);
      piiLogs.push({
        tenant_id: tenantId,
        user_id: ctx.staffUserId,
        vendor_id: allVendorIds[vendorIdx],
        table_name: "vendors",
        column_name: PII_COLUMNS[i % PII_COLUMNS.length],
        purpose: PII_PURPOSES[i % PII_PURPOSES.length],
        accessed_at: new Date(Date.now() - daysAgo * 86400000 - Math.random() * 86400000).toISOString(),
      });
    }

    const { error: piiErr } = await supabase.from("pii_access_log").insert(piiLogs);
    if (piiErr) throw new Error(`PII log insert failed: ${piiErr.message}`);

    // ── Encryption spot-check ────────────────────────────────
    // Check first vendor (full PII) and first partial PII vendor
    const { data: fullCheck } = await supabase
      .from("vendors")
      .select("id, pan_number, pan_number_encrypted, primary_mobile, primary_mobile_encrypted, gst_number, gst_number_encrypted")
      .eq("id", allVendorIds[0])
      .single();

    const { data: partialCheck } = await supabase
      .from("vendors")
      .select("id, pan_number, pan_number_encrypted, cin_number, cin_number_encrypted, secondary_mobile, secondary_mobile_encrypted")
      .eq("id", allVendorIds[10]) // Group 2, first vendor
      .single();

    // Find duplicate PAN vendors
    const { data: dupPanVendors } = await supabase
      .from("vendors")
      .select("id, company_name")
      .like("company_name", "DupPAN Corp%");

    // Count document conditions
    const { count: expiredDocs } = await supabase
      .from("vendor_documents")
      .select("id", { count: "exact", head: true })
      .in("vendor_id", allVendorIds)
      .lt("expiry_date", new Date().toISOString().split("T")[0]);

    const { count: expiring7 } = await supabase
      .from("vendor_documents")
      .select("id", { count: "exact", head: true })
      .in("vendor_id", allVendorIds)
      .gte("expiry_date", new Date().toISOString().split("T")[0])
      .lte("expiry_date", new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]);

    const { count: rejectedDocs } = await supabase
      .from("vendor_documents")
      .select("id", { count: "exact", head: true })
      .in("vendor_id", allVendorIds)
      .eq("status", "rejected");

    const report = {
      success: true,
      vendors_inserted: allVendorIds.length,
      documents_inserted: totalDocsInserted,
      consent_records_inserted: allConsent.length,
      pii_access_logs_inserted: 50,
      status_distribution: statusCounts,
      encryption_spot_check: {
        full_pii_vendor: {
          id: fullCheck?.id,
          pan_encrypted_exists: !!fullCheck?.pan_number_encrypted,
          pan_raw_masked: fullCheck?.pan_number,
          mobile_encrypted_exists: !!fullCheck?.primary_mobile_encrypted,
          mobile_raw_masked: fullCheck?.primary_mobile,
          gst_encrypted_exists: !!fullCheck?.gst_number_encrypted,
        },
        partial_pii_vendor: {
          id: partialCheck?.id,
          pan_encrypted_exists: !!partialCheck?.pan_number_encrypted,
          cin_is_null: partialCheck?.cin_number === null,
          cin_encrypted_is_null: partialCheck?.cin_number_encrypted === null,
          secondary_mobile_is_null: partialCheck?.secondary_mobile === null,
        },
        duplicate_pan_vendors: (dupPanVendors || []).map((v: { id: string; company_name: string }) => ({
          id: v.id,
          name: v.company_name,
        })),
      },
      document_conditions: {
        expired_docs: expiredDocs || 0,
        expiring_within_7_days: expiring7 || 0,
        rejected_with_comments: rejectedDocs || 0,
      },
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
