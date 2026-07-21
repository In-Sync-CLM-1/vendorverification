import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/vendor/portal/dashboard";
const WA_TEMPLATE_NAME = "document_reupload_requested_v1";

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
      return jsonResponse({ error: "Only staff can request a re-upload" }, 403);
    }

    const { document_id } = await req.json();
    if (!document_id) {
      return jsonResponse({ error: "document_id is required" }, 400);
    }

    const { data: doc } = await admin
      .from("vendor_documents")
      .select("id, vendor_id, tenant_id, status, review_comments, document_types (name)")
      .eq("id", document_id)
      .maybeSingle();
    if (!doc) {
      return jsonResponse({ error: "Document not found" }, 404);
    }
    if (doc.status !== "reupload_requested") {
      return jsonResponse({ error: "Document is not currently flagged for re-upload" }, 400);
    }

    const documentTypeName = (doc as any).document_types?.name || "document";
    const reason = doc.review_comments || "Please re-upload this document.";

    const { data: contactRows } = await admin.rpc("get_vendor_contact", { p_vendor_id: doc.vendor_id });
    const contact = Array.isArray(contactRows) ? contactRows[0] : contactRows;
    if (!contact) {
      return jsonResponse({ error: "Vendor contact not found" }, 404);
    }

    const recipientName = contact.primary_contact_name || contact.company_name || "Vendor";
    const reuploadUrl = `${PORTAL_URL}?reupload=${doc.id}`;

    let emailSent = false;
    const hasRealEmail = !!contact.email && !contact.email.endsWith("@app.vendor.local");
    if (hasRealEmail) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: "Vendor-Sync <noreply@in-sync.co.in>",
          to: [contact.email],
          subject: `Action needed: re-upload your ${documentTypeName} - Vendor-Sync`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #ea580c;">
                <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
              </div>
              <div style="padding: 30px 0;">
                <p>Dear <strong>${recipientName}</strong>,</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid #ea580c; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <h3 style="margin: 0 0 8px 0; color: #ea580c;">Please re-upload: ${documentTypeName}</h3>
                  <p style="margin: 0; color: #333;">Reason: ${reason}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${reuploadUrl}" style="background-color: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Re-upload Document
                  </a>
                </div>
                <p style="text-align: center;">
                  <a href="${PORTAL_URL}" style="color: #0066B3;">Or open the vendor portal</a>
                </p>
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
                <p>This is an automated notification. Please do not reply to this email.</p>
              </div>
            </div>
          `,
        }),
      });
      if (emailRes.ok) emailSent = true;
      else console.error("Reupload request email failed:", await emailRes.text());
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
                        { type: "text", text: documentTypeName.slice(0, 60) },
                        { type: "text", text: reason.slice(0, 200) },
                        { type: "text", text: reuploadUrl },
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
            tenant_id: doc.tenant_id,
            vendor_id: doc.vendor_id,
            phone_number: toPhone,
            direction: "outbound",
            template_name: WA_TEMPLATE_NAME,
            template_variables: { "1": recipientName, "2": documentTypeName, "3": reason, "4": reuploadUrl },
            message_content: `Please re-upload your ${documentTypeName}. Reason: ${reason}`,
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

    // In-app notification for the vendor's primary portal login, if one exists.
    const { data: vendorUser } = await admin
      .from("vendor_users")
      .select("user_id")
      .eq("vendor_id", doc.vendor_id)
      .eq("is_primary_contact", true)
      .maybeSingle();
    if (vendorUser?.user_id) {
      await admin.from("notifications").insert({
        recipient_id: vendorUser.user_id,
        tenant_id: doc.tenant_id,
        title: `Please re-upload: ${documentTypeName}`,
        message: `Reason: ${reason}`,
        notification_type: "document_reupload_requested",
        related_vendor_id: doc.vendor_id,
      });
    }

    return jsonResponse({ success: true, email_sent: emailSent, whatsapp_sent: whatsappSent });
  } catch (error) {
    console.error("notify-document-reupload failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
