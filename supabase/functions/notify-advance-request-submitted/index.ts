import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWhatsappSettings } from "../_shared/whatsappSettings.ts";
import { getEmailFrom } from "../_shared/emailSender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/staff/advance-requests";
const WA_TEMPLATE_NAME = "staff_advance_request_submitted_v1";

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

    const { advance_request_id } = await req.json();
    if (!advance_request_id) {
      return jsonResponse({ error: "advance_request_id is required" }, 400);
    }

    const { data: request } = await admin
      .from("vendor_advance_requests")
      .select("id, vendor_id, tenant_id, amount, activity_name, project_owner_user_id, project_owner_name")
      .eq("id", advance_request_id)
      .maybeSingle();
    if (!request) {
      return jsonResponse({ error: "Advance request not found" }, 404);
    }

    // Caller must be the vendor that owns this request.
    const { data: link } = await admin
      .from("vendor_users")
      .select("vendor_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!link || link.vendor_id !== request.vendor_id) {
      return jsonResponse({ error: "Not authorized for this request" }, 403);
    }

    // Advances are issued against an approved PI/Quotation, so approval
    // routes to that same document's Project Owner — not to generic staff.
    const recipientId = request.project_owner_user_id;
    if (!recipientId) {
      return jsonResponse({ success: true, notified: 0, note: "No approver resolved for this request" });
    }

    const { data: vendor } = await admin
      .from("vendors")
      .select("company_name")
      .eq("id", request.vendor_id)
      .maybeSingle();
    const vendorName = vendor?.company_name || "Vendor";
    const amountText = `₹${Number(request.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const recipientName = request.project_owner_name || "Team";

    await admin.from("notifications").insert({
      recipient_id: recipientId,
      tenant_id: request.tenant_id,
      title: `Advance request from ${vendorName}`,
      message: `${vendorName} requested ${amountText} for "${request.activity_name}".`,
      notification_type: "advance_request_submitted",
      related_vendor_id: request.vendor_id,
    });

    let emailSent = false;
    let whatsappSent = false;

    const { data: authUser } = await admin.auth.admin.getUserById(recipientId);
    const recipientEmail = authUser?.user?.email;
    if (recipientEmail) {
      const emailFrom = await getEmailFrom(admin, request.tenant_id);
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: emailFrom,
          to: [recipientEmail],
          subject: `Advance request from ${vendorName} awaiting your approval - Vendor-Sync`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066B3;">
                <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
              </div>
              <div style="padding: 30px 0;">
                <p>Dear <strong>${recipientName}</strong>,</p>
                <p>A vendor has requested an advance against a PI/Quotation you approved.</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid #0066B3; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <h3 style="margin: 0 0 8px 0; color: #0066B3;">Advance requested: ${amountText}</h3>
                  <p style="margin: 4px 0; color: #333;">Vendor: ${vendorName}</p>
                  <p style="margin: 4px 0; color: #333;">Against: ${request.activity_name}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${PORTAL_URL}" style="background-color: #0066B3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Review Request
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
      else console.error("Advance request email failed:", await emailRes.text());
    }

    // Mobile numbers are masked on profiles.phone — the real one is encrypted,
    // so it has to come back through get_staff_mobile.
    const { data: mobile } = await admin.rpc("get_staff_mobile", { p_user_id: recipientId });
    const { data: wsTemplate } = await admin
      .from("whatsapp_templates")
      .select("status")
      .eq("template_name", WA_TEMPLATE_NAME)
      .maybeSingle();
    const wsConfig = await getWhatsappSettings(admin, request.tenant_id);

    if (
      mobile &&
      wsTemplate?.status === "approved" &&
      wsConfig?.exotel_sid &&
      wsConfig?.exotel_api_key &&
      wsConfig?.exotel_api_token &&
      wsConfig?.whatsapp_source_number
    ) {
      const phoneDigits = String(mobile).replace(/\D/g, "");
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
                    { type: "text", text: vendorName.slice(0, 60) },
                    { type: "text", text: amountText },
                    { type: "text", text: request.activity_name.slice(0, 60) },
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
        template_variables: { "1": recipientName, "2": vendorName, "3": amountText, "4": request.activity_name },
        message_content: `Advance request from ${vendorName} for ${amountText}`,
        status: logStatus,
        exotel_message_id: exotelMessageId,
        error_message: errorMessage,
        sent_by: user.id,
        sent_at: logStatus === "sent" ? new Date().toISOString() : null,
      });
      if (logStatus === "sent") whatsappSent = true;
    }

    return jsonResponse({ success: true, notified: 1, email_sent: emailSent, whatsapp_sent: whatsappSent });
  } catch (error) {
    console.error("notify-advance-request-submitted failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
