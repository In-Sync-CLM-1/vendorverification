import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWhatsappSettings } from "../_shared/whatsappSettings.ts";
import { getEmailFrom } from "../_shared/emailSender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/staff/pi-approvals";
const WA_TEMPLATE_NAME = "pi_quotation_submitted_v1";

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

    const { pi_quotation_id } = await req.json();
    if (!pi_quotation_id) {
      return jsonResponse({ error: "pi_quotation_id is required" }, 400);
    }

    const { data: submission } = await admin
      .from("vendor_pi_quotations")
      .select(
        "id, vendor_id, tenant_id, amount, document_type, project_name, project_number, project_owner_user_id, project_owner_name"
      )
      .eq("id", pi_quotation_id)
      .maybeSingle();
    if (!submission) {
      return jsonResponse({ error: "Submission not found" }, 404);
    }

    // Caller must be the vendor that owns this submission.
    const { data: link } = await admin
      .from("vendor_users")
      .select("vendor_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!link || link.vendor_id !== submission.vendor_id) {
      return jsonResponse({ error: "Not authorized for this submission" }, 403);
    }

    const recipientId = submission.project_owner_user_id;
    if (!recipientId) {
      return jsonResponse({ success: true, notified: 0, note: "No approver resolved for this submission" });
    }

    const { data: vendor } = await admin
      .from("vendors")
      .select("company_name")
      .eq("id", submission.vendor_id)
      .maybeSingle();

    const vendorName = vendor?.company_name || "A vendor";
    const docLabel = submission.document_type === "quotation" ? "Quotation" : "Proforma Invoice";
    const amountText =
      submission.amount != null
        ? `₹${Number(submission.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
        : "an unstated amount";
    const projectLabel = submission.project_number || submission.project_name;
    const recipientName = submission.project_owner_name || "Team";

    await admin.from("notifications").insert({
      recipient_id: recipientId,
      tenant_id: submission.tenant_id,
      title: `${docLabel} from ${vendorName}`,
      message: `${vendorName} submitted a ${docLabel.toLowerCase()} of ${amountText} for ${projectLabel}.`,
      notification_type: "pi_quotation_submitted",
      related_vendor_id: submission.vendor_id,
    });

    let emailSent = false;
    let whatsappSent = false;

    const { data: authUser } = await admin.auth.admin.getUserById(recipientId);
    const recipientEmail = authUser?.user?.email;
    if (recipientEmail) {
      const emailFrom = await getEmailFrom(admin, submission.tenant_id);
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: emailFrom,
          to: [recipientEmail],
          subject: `${docLabel} from ${vendorName} awaiting your approval - Vendor-Sync`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066B3;">
                <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
              </div>
              <div style="padding: 30px 0;">
                <p>Dear <strong>${recipientName}</strong>,</p>
                <p>A vendor has submitted a document for your approval as the project owner.</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid #0066B3; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <h3 style="margin: 0 0 8px 0; color: #0066B3;">${docLabel}: ${amountText}</h3>
                  <p style="margin: 4px 0; color: #333;">Vendor: ${vendorName}</p>
                  <p style="margin: 4px 0; color: #333;">Project: ${projectLabel}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${PORTAL_URL}" style="background-color: #0066B3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Review Submission
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
      else console.error("PI/Quotation email failed:", await emailRes.text());
    }

    // Mobile numbers are masked on profiles.phone — the real one is encrypted,
    // so it has to come back through get_staff_mobile.
    const { data: mobile } = await admin.rpc("get_staff_mobile", { p_user_id: recipientId });
    const { data: wsTemplate } = await admin
      .from("whatsapp_templates")
      .select("status")
      .eq("template_name", WA_TEMPLATE_NAME)
      .maybeSingle();
    const wsConfig = await getWhatsappSettings(admin, submission.tenant_id);

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

      // Rupee symbols do not survive template parameters reliably — send "Rs".
      const waAmount = amountText.replace("₹", "Rs ");
      const params = [
        recipientName.slice(0, 60),
        vendorName.slice(0, 60),
        docLabel,
        waAmount,
        String(projectLabel).slice(0, 60),
      ];

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
                  parameters: params.map((text) => ({ type: "text", text })),
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
        tenant_id: submission.tenant_id,
        vendor_id: submission.vendor_id,
        phone_number: toPhone,
        direction: "outbound",
        template_name: WA_TEMPLATE_NAME,
        template_variables: { "1": params[0], "2": params[1], "3": params[2], "4": params[3], "5": params[4] },
        message_content: `${docLabel} from ${vendorName} for ${waAmount} on ${projectLabel}`,
        status: logStatus,
        exotel_message_id: exotelMessageId,
        error_message: errorMessage,
        sent_by: user.id,
        sent_at: logStatus === "sent" ? new Date().toISOString() : null,
      });
      if (logStatus === "sent") whatsappSent = true;
    }

    return jsonResponse({
      success: true,
      notified: 1,
      email_sent: emailSent,
      whatsapp_sent: whatsappSent,
      whatsapp_status: wsTemplate?.status ?? "not registered",
    });
  } catch (error) {
    console.error("notify-pi-quotation-submitted failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
