import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public API for enterprise customers — auth via API key (Bearer isk_live_...)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function jsonOk(data: object, requestId: string) {
  return new Response(JSON.stringify({ success: true, ...data, request_id: requestId }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(code: string, message: string, status = 400, requestId?: string) {
  return new Response(
    JSON.stringify({ success: false, error: code, message, request_id: requestId ?? crypto.randomUUID() }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate via API key
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer isk_live_")) {
      return jsonErr("unauthorized", "Valid API key required (Bearer isk_live_...)", 401, requestId);
    }

    const apiKey = authHeader.replace("Bearer ", "").trim();
    const keyHash = await sha256Hex(apiKey);

    const { data: keyRecord } = await supabase
      .from("api_keys")
      .select("id, tenant_id, is_active")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (!keyRecord) {
      return jsonErr("unauthorized", "Invalid or inactive API key", 401, requestId);
    }

    const tenantId: string = keyRecord.tenant_id;

    // Update last_used_at fire-and-forget
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRecord.id)
      .then(() => {});

    // Resolve action and org-slug from headers (set by the Cloudflare worker that
    // routes /api/<org-slug>/<action>). Fall back to request body for direct/legacy
    // callers hitting the function URL with {action: "..."} in JSON.
    const headerOrgSlug = req.headers.get("X-Org-Slug");
    const headerAction = req.headers.get("X-Action");
    const body = await req.json().catch(() => ({}));
    const action = headerAction || body.action;

    if (!action) {
      return jsonErr("missing_action", "action is required (path /api/<org>/<action> or body.action)", 400, requestId);
    }

    // If the request came via the worker, sanity-check that the URL's org-slug
    // matches the tenant the API key belongs to. Prevents one tenant's key from
    // being used at another tenant's URL.
    if (headerOrgSlug) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .maybeSingle();
      if (!tenant || tenant.slug !== headerOrgSlug) {
        return jsonErr(
          "org_mismatch",
          "API key does not belong to the organization in the URL",
          403,
          requestId
        );
      }
    }

    // ── list_approved_vendors ───────────────────────────────────────
    // Read-only listing of this tenant's already-approved vendors — no
    // verification is performed, so it doesn't draw from the quota below.
    if (action === "list_approved_vendors") {
      const { data: vendors, error: listErr } = await supabase
        .from("vendors")
        .select("vendor_code, company_name, trade_name, approved_at, primary_contact_name, primary_mobile, primary_email, vendor_categories(name)")
        .eq("tenant_id", tenantId)
        .eq("current_status", "approved")
        .order("approved_at", { ascending: false });

      if (listErr) {
        return jsonErr("query_failed", listErr.message, 500, requestId);
      }

      const data = (vendors || []).map((v: any) => ({
        vendor_code: v.vendor_code,
        company_name: v.company_name,
        trade_name: v.trade_name,
        category: v.vendor_categories?.name ?? null,
        contact_name: v.primary_contact_name,
        contact_mobile: v.primary_mobile,
        contact_email: v.primary_email,
        approved_at: v.approved_at,
      }));

      return jsonOk({ data }, requestId);
    }

    // ── list_invoices ────────────────────────────────────────────────
    // Read-only listing of this tenant's vendor invoices (every status) with
    // their recorded payments — no verification is performed, so no quota draw.
    if (action === "list_invoices") {
      const { data: invoices, error: listErr } = await supabase
        .from("vendor_invoices")
        .select(
          "invoice_number, invoice_date, invoice_amount, gst_amount, description, po_number, status, rejection_reason, reviewed_at, created_at, vendors(company_name, trade_name, vendor_code), vendor_invoice_payments(payment_date, advance_adjusted, gst_amount, tds_amount, payout_amount, total_settled, utr_reference, remarks, is_full_settlement)"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (listErr) {
        return jsonErr("query_failed", listErr.message, 500, requestId);
      }

      const data = (invoices || []).map((inv: any) => ({
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        invoice_amount: inv.invoice_amount,
        gst_amount: inv.gst_amount,
        description: inv.description,
        po_number: inv.po_number,
        status: inv.status,
        rejection_reason: inv.rejection_reason,
        reviewed_at: inv.reviewed_at,
        created_at: inv.created_at,
        vendor_company_name: inv.vendors?.company_name ?? null,
        vendor_trade_name: inv.vendors?.trade_name ?? null,
        vendor_code: inv.vendors?.vendor_code ?? null,
        payments: (inv.vendor_invoice_payments || []).map((p: any) => ({
          payment_date: p.payment_date,
          advance_adjusted: p.advance_adjusted,
          gst_amount: p.gst_amount,
          tds_amount: p.tds_amount,
          payout_amount: p.payout_amount,
          total_settled: p.total_settled,
          utr_reference: p.utr_reference,
          remarks: p.remarks,
          is_full_settlement: p.is_full_settlement,
        })),
      }));

      return jsonOk({ data }, requestId);
    }

    // Deduct from quota for all actions
    const { data: usageResult } = await supabase.rpc("increment_vendor_usage", {
      _tenant_id: tenantId,
    });
    if (usageResult === -2) {
      return jsonErr(
        "quota_exceeded",
        "Verification limit reached. Please upgrade your plan.",
        429,
        requestId
      );
    }

    // ── verify_gst ───────────────────────────────────────────────────
    if (action === "verify_gst") {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-gst`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gstin: body.gstin, vendor_id: body.vendor_id ?? null }),
      });
      const data = await res.json();
      return jsonOk({ data }, requestId);
    }

    // ── verify_pan ───────────────────────────────────────────────────
    if (action === "verify_pan") {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-pan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pan_number: body.pan_number, vendor_id: body.vendor_id ?? null }),
      });
      const data = await res.json();
      return jsonOk({ data }, requestId);
    }

    // ── verify_bank_account ──────────────────────────────────────────
    if (action === "verify_bank_account") {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-bank-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_number: body.account_number,
          ifsc_code: body.ifsc_code,
          vendor_id: body.vendor_id ?? null,
        }),
      });
      const data = await res.json();
      return jsonOk({ data }, requestId);
    }

    // ── get_vendor ───────────────────────────────────────────────────
    if (action === "get_vendor") {
      if (!body.vendor_id) {
        return jsonErr("missing_param", "vendor_id is required", 400, requestId);
      }

      const { data: vendor } = await supabase
        .from("vendors")
        .select("id, company_name, current_status, submitted_at, approved_at, rejected_at, rejection_reason")
        .eq("id", body.vendor_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!vendor) {
        return jsonErr("not_found", "Vendor not found", 404, requestId);
      }

      const { data: verifications } = await supabase
        .from("vendor_verifications")
        .select("verification_type, status, verified_at")
        .eq("vendor_id", body.vendor_id)
        .order("verified_at", { ascending: false });

      return jsonOk({ data: { vendor, verifications: verifications || [] } }, requestId);
    }

    // ── submit_vendor ────────────────────────────────────────────────
    if (action === "submit_vendor") {
      const {
        company_name, primary_contact_name, primary_mobile, primary_email,
        trade_name, gst_number, pan_number,
        bank_name, bank_branch, bank_account_number, bank_ifsc,
      } = body;

      if (!company_name || !primary_contact_name || !primary_mobile || !primary_email) {
        return jsonErr(
          "missing_fields",
          "company_name, primary_contact_name, primary_mobile, primary_email are required",
          400,
          requestId
        );
      }

      const { data: vendor, error: insertErr } = await supabase
        .from("vendors")
        .insert({
          company_name: String(company_name).trim().substring(0, 255),
          trade_name: trade_name ? String(trade_name).trim().substring(0, 255) : null,
          gst_number: gst_number ? String(gst_number).toUpperCase() : null,
          pan_number: pan_number ? String(pan_number).toUpperCase() : null,
          primary_contact_name: String(primary_contact_name).trim().substring(0, 255),
          primary_mobile: String(primary_mobile).trim(),
          primary_email: String(primary_email).trim(),
          bank_name: bank_name ? String(bank_name).trim() : null,
          bank_branch: bank_branch ? String(bank_branch).trim() : null,
          bank_account_number: bank_account_number ? String(bank_account_number).trim() : null,
          bank_ifsc: bank_ifsc ? String(bank_ifsc).toUpperCase() : null,
          tenant_id: tenantId,
          current_status: "pending_review",
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr) {
        return jsonErr("insert_failed", insertErr.message, 500, requestId);
      }

      return jsonOk({ data: { vendor_id: vendor.id } }, requestId);
    }

    return jsonErr("unknown_action", `Unknown action: ${action}`, 400, requestId);
  } catch (err) {
    console.error("Public API error:", err);
    return jsonErr("internal_error", "Request failed", 500, requestId);
  }
});
