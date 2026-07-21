import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/vendor/portal/dashboard";
const WA_TEMPLATE_NAME = "vendor_advance_decision_v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ error: "Not signed in" }, 401);
    }
    const { data: isStaff } = await admin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) {
      return jsonResponse({ error: "Only staff can trigger this" }, 403);
    }

    const { advance_request_id } = await req.json();
    if (!advance_request_id) {
      return jsonResponse({ error: "advance_request_id is required" }, 400);
    }

    const { data: request } = await admin
      .from("vendor_advance_requests")
      .select("id, vendor_id, tenant_id, amount, activity_name, status, review_comments, internal_projects (name)")
      .eq("id", advance_request_id)
      .maybeSingle();
    if (!request) {
      return jsonResponse({ error: "Advance request not found" }, 404);
    }
    if (request.status === "pending") {
      return jsonResponse({ error: "This request hasn't been decided yet" }, 400);
    }

    const { data: contactRows } = await admin.rpc("get_vendor_contact", { p_vendor_id: request.vendor_id });
    const contact = Array.isArray(contactRows) ? contactRows[0] : contactRows;
    if (!contact) {
      return jsonResponse({ error: "Vendor contact not found" }, 404);
    }

    const recipientName = contact.primary_contact_name || contact.company_name || "Vendor";
    const amountText = `₹${Number(request.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const approved = request.status === "approved";
    const title = approved
      ? `Advance request approved: ${amountText}`
      : `Advance request not approved: ${amountText}`;
    const message = approved
      ? `Your advance request of ${amountText} for "${request.activity_name}" has been approved${(request as any).internal_projects?.name ? ` (project: ${(request as any).internal_projects.name})` : ""}. It will be adjusted against a future invoice.`
      : `Your advance request of ${amountText} for "${request.activity_name}" was not approved. ${request.review_comments ? `Reason: ${request.review_comments}` : ""}`;
    const accentColor = approved ? "#16a34a" : "#dc2626";

    let emailSent = false;
    const hasRealEmail = !!contact.email && !contact.email.endsWith("@app.vendor.local");
    if (hasRealEmail) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: "Vendor-Sync <noreply@in-sync.co.in>",
          to: [contact.email],
          subject: `${title} - Vendor-Sync`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid ${accentColor};">
                <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
              </div>
              <div style="padding: 30px 0;">
                <p>Dear <strong>${recipientName}</strong>,</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid ${accentColor}; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <h3 style="margin: 0 0 8px 0; color: ${accentColor};">${title}</h3>
                  <p style="margin: 0; color: #333;">${message}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${PORTAL_URL}" style="background-color: ${accentColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Open Vendor Portal
                  </a>
                </div>
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
                <p>This is an automated notification. Please do not reply to this email.</p>
              </div>
            </div>
          `,
        }),
      });
      if (emailRes.ok) emailSent = true;
      else console.error("Advance decision email failed:", await emailRes.text());
    }

    let whatsappSent = false;
    if (contact.mobile) {
      const { data: template } = await admin
        .from("whatsapp_templates")
        .select("status")
        .eq("template_name", WA_TEMPLATE_NAME)
        .maybeSingle();

      if (template?.status === "approved") {
        const { data: wsConfig } = await admin
          .from("whatsapp_settings")
          .select("exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, whatsapp_source_number")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (wsConfig?.exotel_sid && wsConfig?.exotel_api_key && wsConfig?.exotel_api_token && wsConfig?.whatsapp_source_number) {
          const phoneDigits = contact.mobile.replace(/\D/g, "");
          const toPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
          const fromNumber = wsConfig.whatsapp_source_number.replace("+", "");
          const subdomain = wsConfig.exotel_subdomain || "api.exotel.com";

          const waPayload = {
            custom_data: toPhone,
            whatsapp: {
              messages: [{
                from: fromNumber,
                to: toPhone,
                content: {
                  type: "template",
                  template: {
                    name: WA_TEMPLATE_NAME,
                    language: { code: "en" },
                    components: [{
                      type: "body",
                      parameters: [
                        { type: "text", text: recipientName.slice(0, 60) },
                        { type: "text", text: message.slice(0, 300) },
                      ],
                    }],
                  },
                },
              }],
            },
          };

          const waAuth = `Basic ${btoa(`${wsConfig.exotel_api_key}:${wsConfig.exotel_api_token}`)}`;
          const waRes = await fetch(`https://${subdomain}/v2/accounts/${wsConfig.exotel_sid}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: waAuth },
            body: JSON.stringify(waPayload),
          });
          const waText = await waRes.text();
          let exotelMessageId: string | null = null;
          let errorMessage: string | null = null;
          let logStatus: "sent" | "failed" = waRes.ok ? "sent" : "failed";
          try {
            const parsed = JSON.parse(waText);
            const msg = parsed?.response?.whatsapp?.messages?.[0];
            exotelMessageId = msg?.data?.sid ?? msg?.data?.id ?? null;
            const accepted = waRes.ok && (msg?.code === 200 || msg?.code === 202) && !!exotelMessageId;
            logStatus = accepted ? "sent" : "failed";
            if (!accepted) errorMessage = msg?.error_data?.description ?? msg?.error_data?.message ?? waText.slice(0, 500);
          } catch {
            logStatus = "failed";
            errorMessage = waText.slice(0, 500);
          }

          await admin.from("whatsapp_messages").insert({
            tenant_id: request.tenant_id,
            vendor_id: request.vendor_id,
            phone_number: toPhone,
            direction: "outbound",
            template_name: WA_TEMPLATE_NAME,
            template_variables: { "1": recipientName, "2": message },
            message_content: message,
            status: logStatus,
            exotel_message_id: exotelMessageId,
            error_message: errorMessage,
            sent_by: user.id,
            sent_at: logStatus === "sent" ? new Date().toISOString() : null,
          });
          whatsappSent = logStatus === "sent";
        }
      }
    }

    return jsonResponse({ success: true, email_sent: emailSent, whatsapp_sent: whatsappSent });
  } catch (error) {
    console.error("notify-vendor-advance-decision failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
