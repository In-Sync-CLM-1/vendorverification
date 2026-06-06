import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Validation helper functions
function isValidIndianPhone(phone: string): boolean {
  const phoneRegex = /^[6-9]\d{9}$/;
  let digits = phone.replace(/\D/g, '');
  // Strip leading country code 91 if present
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.substring(2);
  }
  return phoneRegex.test(digits);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidGST(gst: string): boolean {
  return gst.length === 15 && /^[0-9A-Z]{15}$/.test(gst);
}

function isValidPAN(pan: string): boolean {
  return pan.length === 10 && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

function isValidIFSC(ifsc: string): boolean {
  return ifsc.length === 11 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
}

function sanitizeString(value: string, maxLength: number): string {
  return value.trim().substring(0, maxLength);
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { consent_version, formData, documents, session_id, tenant_id } = await req.json();

    if (!formData || !session_id) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidUUID(session_id)) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      company_name,
      primary_contact_name,
      primary_mobile,
      primary_email,
      category_id,
      trade_name,
      gst_number,
      pan_number,
      bank_name,
      bank_branch,
      bank_account_number,
      bank_ifsc,
      salutation,
      constitution_type,
    } = formData;

    if (!company_name || !primary_contact_name || !primary_mobile || !primary_email || !category_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidIndianPhone(primary_mobile)) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidEmail(primary_email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (gst_number && !isValidGST(gst_number)) {
      return new Response(JSON.stringify({ error: "Invalid GST number" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pan_number && !isValidPAN(pan_number)) {
      return new Response(JSON.stringify({ error: "Invalid PAN number" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (bank_ifsc && !isValidIFSC(bank_ifsc)) {
      return new Response(JSON.stringify({ error: "Invalid IFSC code" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (company_name.length > 255 || primary_contact_name.length > 255) {
      return new Response(JSON.stringify({ error: "Field length exceeded" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // tenant_id is required — no fallback to "in-sync" default to avoid silently
    // mis-attributing self-registrations to the wrong tenant.
    const resolvedTenantId = tenant_id;
    if (!resolvedTenantId) {
      return new Response(
        JSON.stringify({ error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: categoryRow, error: categoryErr } = await supabase
      .from("vendor_categories")
      .select("tenant_id, is_active")
      .eq("id", category_id)
      .maybeSingle();

    if (categoryErr || !categoryRow || !categoryRow.is_active || categoryRow.tenant_id !== resolvedTenantId) {
      return new Response(
        JSON.stringify({ error: "Invalid category for this tenant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .insert({
        company_name: sanitizeString(company_name, 255),
        trade_name: trade_name ? sanitizeString(trade_name, 255) : null,
        category_id,
        gst_number: gst_number || null,
        pan_number: pan_number || null,
        primary_contact_name: sanitizeString(primary_contact_name, 255),
        primary_mobile,
        primary_email,
        bank_name: bank_name ? sanitizeString(bank_name, 255) : null,
        bank_branch: bank_branch ? sanitizeString(bank_branch, 255) : null,
        bank_account_number: bank_account_number ? sanitizeString(bank_account_number, 100) : null,
        bank_ifsc: bank_ifsc || null,
        salutation: salutation || null,
        constitution_type: constitution_type || null,
        referred_by: null,
        tenant_id: resolvedTenantId,
        current_status: "pending_review",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (vendorErr) {
      console.error("Vendor creation failed:", vendorErr);
      return new Response(JSON.stringify({ error: "Registration failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Link uploaded documents to the vendor
    if (documents && Array.isArray(documents) && documents.length > 0) {
      const docRows = documents.map((doc: any) => ({
        vendor_id: vendor.id,
        tenant_id: resolvedTenantId,
        document_type_id: doc.document_type_id,
        file_name: doc.file_name,
        file_url: doc.file_path,
        file_size_bytes: doc.file_size || null,
        status: "uploaded",
      }));

      const { data: insertedDocs, error: docErr } = await supabase
        .from("vendor_documents")
        .insert(docRows)
        .select("id");
      if (docErr) {
        console.error("Failed to link documents:", docErr);
        // Don't fail the whole submission for this
      }

      // Fire-and-forget: trigger AI analysis for each inserted document
      if (insertedDocs && insertedDocs.length > 0) {
        for (const insertedDoc of insertedDocs) {
          fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ document_id: insertedDoc.id }),
          }).catch((err) => console.error("Auto-analysis trigger failed:", err));
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, vendor_id: vendor.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error processing request:", err);
    return new Response(JSON.stringify({ error: "Registration failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
