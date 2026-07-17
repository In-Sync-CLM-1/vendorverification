import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/vendor/portal";
const WA_TEMPLATE_NAME = "vendor_invoice_update_v1";

type NotifyEvent = "invoice_approved" | "invoice_rejected" | "payment_recorded";

function statusText(event: NotifyEvent, invoiceNumber: string, extra?: Record<string, unknown>): { title: string; message: string; accentColor: string } {
  if (event === "invoice_approved") {
    return {
      title: `Invoice ${invoiceNumber} approved`,
      message: `Your invoice ${invoiceNumber} has been approved for payment. You'll be notified again once the payment is made.`,
      accentColor: "#16a34a",
    };
  }
  if (event === "invoice_rejected") {
    const reason = typeof extra?.reason === "string" && extra.reason ? extra.reason : "Please contact the team for details.";
    return {
      title: `Invoice ${invoiceNumber} rejected`,
      message: `Your invoice ${invoiceNumber} was rejected. Reason: ${reason}`,
      accentColor: "#dc2626",
    };
  }
  const amount = typeof extra?.amount === "number" ? extra.amount : null;
  const utr = typeof extra?.utr === "string" && extra.utr ? ` (UTR: ${extra.utr})` : "";
  const amountText = amount !== null ? `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "a payment";
  return {
    title: `Payment recorded for invoice ${invoiceNumber}`,
    message: `${amountText} has been paid against your invoice ${invoiceNumber}${utr}. Log in to the vendor portal to view the full breakup.`,
    accentColor: "#0066B3",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: isStaff } = await admin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { event, invoice_id, extra } = await req.json() as {
      event: NotifyEvent;
      invoice_id: string;
      extra?: Record<string, unknown>;
    };

    if (!event || !invoice_id) {
      return new Response(JSON.stringify({ error: "event and invoice_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice, error: invErr } = await admin
      .from("vendor_invoices")
      .select("invoice_number, vendor_id, tenant_id")
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Staff can only trigger notifications for their own tenant's invoices.
    const { data: callerTenantId } = await admin.rpc("get_user_tenant_id", { _user_id: user.id });
    if (!callerTenantId || callerTenantId !== invoice.tenant_id) {
      return new Response(JSON.stringify({ error: "Invoice is not in your organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contactRows, error: contactErr } = await admin.rpc("get_vendor_contact", {
      p_vendor_id: invoice.vendor_id,
    });
    const contact = Array.isArray(contactRows) ? contactRows[0] : contactRows;
    if (contactErr || !contact) {
      return new Response(JSON.stringify({ error: "Vendor contact not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, message, accentColor } = statusText(event, invoice.invoice_number, extra);
    const recipientName = contact.primary_contact_name || contact.company_name || "Vendor";
    const results: Record<string, unknown> = {};

    // ---- Email (skip synthetic phone-login placeholder addresses) ----
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
      results.email = emailRes.ok ? "sent" : "failed";
      if (!emailRes.ok) console.error("Email send failed:", await emailRes.text());
    } else {
      results.email = "skipped_no_email";
    }

    // ---- WhatsApp (only once the utility template is Meta-approved) ----
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
            tenant_id: invoice.tenant_id,
            vendor_id: invoice.vendor_id,
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
          results.whatsapp = logStatus;
        } else {
          results.whatsapp = "skipped_no_wa_config";
        }
      } else {
        results.whatsapp = "skipped_template_not_approved";
      }
    } else {
      results.whatsapp = "skipped_no_mobile";
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-vendor-invoice-status failed:", err);
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
