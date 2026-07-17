import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test((phone || "").replace(/\D/g, ""));
}
function sanitize(value: string, maxLength: number): string {
  return (value || "").trim().substring(0, maxLength);
}

interface Row {
  company_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await asUser.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: isStaff } = await admin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) return json({ error: "Unauthorized" }, 403);

    const { data: tenantId, error: tenantErr } = await admin.rpc("get_user_tenant_id", { _user_id: user.id });
    if (tenantErr || !tenantId) return json({ error: "Tenant not found for user" }, 400);

    const body = await req.json();
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return json({ error: "No rows provided" }, 400);
    if (rows.length > 200) return json({ error: "Maximum 200 invitations per batch" }, 400);

    // Resolve categories (name -> id) for this tenant, case-insensitive
    const { data: cats } = await admin
      .from("vendor_categories")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    const catMap = new Map<string, string>();
    (cats || []).forEach((c: any) => catMap.set(String(c.name).trim().toLowerCase(), c.id));

    // Staff referral code (shared registration link) + WhatsApp config — fetched once
    const { data: refCode } = await admin
      .from("staff_referral_codes")
      .select("referral_code")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const { data: wsConfig } = await admin
      .from("whatsapp_settings")
      .select("exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, whatsapp_source_number")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    let success_count = 0;
    const failed_rows: { row_number: number; company_name: string; errors: string[] }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 1;
      const errors: string[] = [];
      const company = sanitize(r.company_name || "", 255);
      const email = (r.contact_email || "").trim();
      const phone = (r.contact_phone || "").trim();
      const catId = catMap.get((r.category_name || "").trim().toLowerCase());

      if (!company) errors.push("company_name is required");
      if (!email) errors.push("contact_email is required");
      else if (!isValidEmail(email)) errors.push("invalid email");
      if (!phone) errors.push("contact_phone is required");
      else if (!isValidIndianPhone(phone)) errors.push("invalid Indian phone");
      if (!r.category_name) errors.push("category_name is required");
      else if (!catId) errors.push(`unknown category "${r.category_name}"`);

      if (errors.length) {
        failed_rows.push({ row_number: rowNum, company_name: company, errors });
        continue;
      }

      const token = crypto.randomUUID();
      const registrationPath = refCode?.referral_code ? `/register/ref/${refCode.referral_code}` : `/register/ref/${token}`;
      const registrationUrl = `https://vendorverification.in-sync.co.in${registrationPath}`;

      // Insert invitation
      const { error: insErr } = await admin.from("vendor_invitations").insert({
        tenant_id: tenantId, company_name: company, contact_email: email,
        contact_phone: phone, category_id: catId, token, created_by: user.id,
      });
      if (insErr) {
        failed_rows.push({ row_number: rowNum, company_name: company, errors: ["could not create invitation"] });
        continue;
      }

      // Email (best-effort — invitation already created)
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
          body: JSON.stringify({
            from: "Vendor-Sync <noreply@in-sync.co.in>",
            to: [email],
            subject: "Vendor Registration Invitation",
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
              <div style="text-align:center;padding:20px 0;border-bottom:2px solid #0066B3">
                <h1 style="color:#0066B3;margin:0">Vendor-Sync</h1></div>
              <div style="padding:30px 0"><p>Dear <strong>${sanitize(company, 100)}</strong>,</p>
              <p>You have been invited to register as a vendor. Click below to complete your registration.</p>
              <div style="text-align:center;margin:30px 0">
                <a href="${registrationUrl}" style="background:#0066B3;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">Complete Registration</a></div>
              <p style="color:#666;font-size:14px">This invitation is valid for 7 days.</p></div></div>`,
          }),
        });
      } catch (_) { /* non-critical */ }

      // WhatsApp (best-effort) + audit log
      try {
        if (wsConfig?.exotel_sid && wsConfig?.exotel_api_key && wsConfig?.exotel_api_token && wsConfig?.whatsapp_source_number) {
          const digits = phone.replace(/\D/g, "");
          const toPhone = digits.length === 10 ? `91${digits}` : digits;
          const fromNumber = wsConfig.whatsapp_source_number.replace("+", "");
          const subdomain = wsConfig.exotel_subdomain || "api.exotel.com";
          const safeCompany = sanitize(company, 60);
          const waPayload = {
            custom_data: toPhone,
            whatsapp: { messages: [{ from: fromNumber, to: toPhone, content: { type: "template", template: {
              name: "vendor_invitation_v2", language: { code: "en" },
              components: [{ type: "body", parameters: [{ type: "text", text: safeCompany }, { type: "text", text: registrationUrl }] }],
            } } }] },
          };
          const waAuth = `Basic ${btoa(`${wsConfig.exotel_api_key}:${wsConfig.exotel_api_token}`)}`;
          const waRes = await fetch(`https://${subdomain}/v2/accounts/${wsConfig.exotel_sid}/messages`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: waAuth }, body: JSON.stringify(waPayload),
          });
          const waText = await waRes.text();
          let sid: string | null = null, errMsg: string | null = null, logStatus: "sent" | "failed" = "failed";
          try {
            const parsed = JSON.parse(waText);
            const msg = parsed?.response?.whatsapp?.messages?.[0];
            sid = msg?.data?.sid ?? msg?.data?.id ?? null;
            const ok = waRes.ok && (msg?.code === 200 || msg?.code === 202) && !!sid;
            logStatus = ok ? "sent" : "failed";
            if (!ok) errMsg = msg?.error_data?.description ?? msg?.error_data?.message ?? waText.slice(0, 500);
          } catch { errMsg = waText.slice(0, 500); }
          await admin.from("whatsapp_messages").insert({
            tenant_id: tenantId, vendor_id: null, phone_number: toPhone, direction: "outbound",
            template_name: "vendor_invitation_v2", template_variables: { "1": safeCompany, "2": registrationUrl },
            message_content: `Hi ${safeCompany}, you have been invited to register as a vendor. Complete your registration here: ${registrationUrl}`,
            status: logStatus, exotel_message_id: sid, error_message: errMsg, sent_by: user.id,
            sent_at: logStatus === "sent" ? new Date().toISOString() : null,
          });
        }
      } catch (_) { /* non-critical */ }

      success_count++;
    }

    return json({ success_count, failed_rows }, 200);
  } catch (err) {
    console.error("bulk-invite failed", err);
    return json({ error: "Request failed" }, 500);
  }

  function json(obj: unknown, status: number) {
    return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
