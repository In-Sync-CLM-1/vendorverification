import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/vendor/portal";
const WA_TEMPLATE_NAME = "staff_invoice_submitted_v1";
const TOKEN_TTL_DAYS = 14;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ error: "Not signed in" }, 401);
    }

    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return jsonResponse({ error: "invoice_id is required" }, 400);
    }

    // Caller must be the vendor that owns this invoice.
    const { data: link } = await admin
      .from("vendor_users")
      .select("vendor_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!link) {
      return jsonResponse({ error: "Only vendor accounts can trigger this" }, 403);
    }

    const { data: invoice } = await admin
      .from("vendor_invoices")
      .select("id, invoice_number, invoice_amount, invoice_date, description, status, vendor_id, tenant_id")
      .eq("id", invoice_id)
      .maybeSingle();
    if (!invoice || invoice.vendor_id !== link.vendor_id) {
      return jsonResponse({ error: "Invoice not found" }, 404);
    }

    const { data: vendor } = await admin
      .from("vendors")
      .select("company_name")
      .eq("id", invoice.vendor_id)
      .maybeSingle();
    const vendorName = vendor?.company_name || "Vendor";

    // Approvers for this tenant; fall back to admins if none are configured.
    let { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", invoice.tenant_id)
      .eq("role", "approver");
    if (!roleRows || roleRows.length === 0) {
      ({ data: roleRows } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", invoice.tenant_id)
        .eq("role", "admin"));
    }
    const approverIds = Array.from(new Set((roleRows || []).map((r) => r.user_id)));

    if (approverIds.length === 0) {
      return jsonResponse({ success: true, notified: 0, note: "No approver configured for this tenant" });
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name, phone")
      .in("user_id", approverIds)
      .eq("tenant_id", invoice.tenant_id);

    const { data: wsTemplate } = await admin
      .from("whatsapp_templates")
      .select("status")
      .eq("template_name", WA_TEMPLATE_NAME)
      .maybeSingle();
    const { data: wsConfig } = await admin
      .from("whatsapp_settings")
      .select("exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, whatsapp_source_number")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    let emailCount = 0;
    let whatsappCount = 0;

    for (const approverId of approverIds) {
      const profile = profiles?.find((p) => p.user_id === approverId);
      const approverName = profile?.full_name || "Approver";

      const rawToken = randomToken();
      const tokenHash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      await admin.from("invoice_action_tokens").insert({
        invoice_id: invoice.id,
        tenant_id: invoice.tenant_id,
        staff_user_id: approverId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      const approveUrl = `${supabaseUrl}/functions/v1/invoice-approval-action?token=${rawToken}&action=approve`;
      const rejectUrl = `${supabaseUrl}/functions/v1/invoice-approval-action?token=${rawToken}&action=reject`;
      const amountText = `₹${Number(invoice.invoice_amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

      // ---- In-app notification ----
      await admin.from("notifications").insert({
        recipient_id: approverId,
        tenant_id: invoice.tenant_id,
        title: `Invoice ${invoice.invoice_number} needs your review`,
        message: `${vendorName} submitted invoice ${invoice.invoice_number} for ${amountText}.`,
        notification_type: "invoice_submitted",
        related_vendor_id: invoice.vendor_id,
      });

      // ---- Email (with Approve / Reject buttons) ----
      const { data: authUser } = await admin.auth.admin.getUserById(approverId);
      const approverEmail = authUser?.user?.email;
      if (approverEmail) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
          body: JSON.stringify({
            from: "Vendor-Sync <noreply@in-sync.co.in>",
            to: [approverEmail],
            subject: `Invoice ${invoice.invoice_number} needs your review - Vendor-Sync`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066B3;">
                  <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
                </div>
                <div style="padding: 30px 0;">
                  <p>Dear <strong>${approverName}</strong>,</p>
                  <div style="background-color: #f8f9fa; border-left: 4px solid #0066B3; padding: 16px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="margin: 0 0 8px 0; color: #0066B3;">Invoice ${invoice.invoice_number}</h3>
                    <p style="margin: 4px 0; color: #333;">Vendor: ${vendorName}</p>
                    <p style="margin: 4px 0; color: #333;">Amount: ${amountText}</p>
                    <p style="margin: 4px 0; color: #333;">Date: ${invoice.invoice_date}</p>
                    ${invoice.description ? `<p style="margin: 4px 0; color: #333;">Description: ${invoice.description}</p>` : ""}
                  </div>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${approveUrl}" style="background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin: 0 8px;">
                      Approve
                    </a>
                    <a href="${rejectUrl}" style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin: 0 8px;">
                      Reject
                    </a>
                  </div>
                  <p style="text-align: center;">
                    <a href="${PORTAL_URL}" style="color: #0066B3;">Or review full details in the portal</a>
                  </p>
                </div>
                <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
                  <p>This is an automated notification. Please do not reply to this email.</p>
                </div>
              </div>
            `,
          }),
        });
        if (emailRes.ok) emailCount++;
        else console.error("Approver email send failed:", await emailRes.text());
      }

      // ---- WhatsApp (only once the utility template with URL buttons is Meta-approved) ----
      if (profile?.phone && wsTemplate?.status === "approved" && wsConfig?.exotel_sid && wsConfig?.exotel_api_key && wsConfig?.exotel_api_token && wsConfig?.whatsapp_source_number) {
        const phoneDigits = profile.phone.replace(/\D/g, "");
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
                  components: [
                    {
                      type: "body",
                      parameters: [
                        { type: "text", text: approverName.slice(0, 60) },
                        { type: "text", text: invoice.invoice_number.slice(0, 60) },
                        { type: "text", text: vendorName.slice(0, 60) },
                      ],
                    },
                    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: rawToken }] },
                    { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: rawToken }] },
                  ],
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
          tenant_id: invoice.tenant_id,
          vendor_id: invoice.vendor_id,
          phone_number: toPhone,
          direction: "outbound",
          template_name: WA_TEMPLATE_NAME,
          template_variables: { "1": approverName, "2": invoice.invoice_number, "3": vendorName },
          message_content: `Invoice ${invoice.invoice_number} needs review`,
          status: logStatus,
          exotel_message_id: exotelMessageId,
          error_message: errorMessage,
          sent_by: user.id,
          sent_at: logStatus === "sent" ? new Date().toISOString() : null,
        });
        if (logStatus === "sent") whatsappCount++;
      }
    }

    return jsonResponse({ success: true, approvers: approverIds.length, emails_sent: emailCount, whatsapp_sent: whatsappCount });
  } catch (error) {
    console.error("notify-invoice-submitted failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
