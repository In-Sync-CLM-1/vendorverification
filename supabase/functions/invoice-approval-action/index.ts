import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTAL_URL = "https://vendor.in-sync.co.in/vendor/portal";
const VENDOR_WA_TEMPLATE_NAME = "vendor_invoice_update_v1";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function page(title: string, bodyHtml: string): Response {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 24px; color: #222; }
    .card { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
    h1 { color: #0066B3; font-size: 20px; margin: 0 0 16px; }
    .row { margin: 6px 0; color: #333; font-size: 14px; }
    .row b { color: #555; }
    textarea { width: 100%; box-sizing: border-box; min-height: 80px; padding: 10px; border: 1px solid #ccc; border-radius: 8px; font-family: inherit; font-size: 14px; margin-top: 6px; }
    button { border: none; border-radius: 8px; padding: 12px 24px; font-weight: bold; font-size: 15px; cursor: pointer; color: #fff; width: 100%; margin-top: 16px; }
    .approve { background: #16a34a; }
    .reject { background: #dc2626; }
    .error { color: #dc2626; font-size: 13px; margin-top: 8px; }
    a.link { color: #0066B3; text-decoration: none; font-size: 13px; }
    .footer { text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

interface TokenRow {
  id: string;
  invoice_id: string;
  tenant_id: string;
  staff_user_id: string;
  used_at: string | null;
  expires_at: string;
}

async function loadToken(admin: ReturnType<typeof createClient>, rawToken: string): Promise<TokenRow | null> {
  const tokenHash = await sha256Hex(rawToken);
  const { data } = await admin
    .from("invoice_action_tokens")
    .select("id, invoice_id, tenant_id, staff_user_id, used_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  return (data as TokenRow) || null;
}

async function notifyVendorOfOutcome(
  admin: ReturnType<typeof createClient>,
  resendApiKey: string,
  vendorId: string,
  tenantId: string,
  invoiceNumber: string,
  outcome: "approved" | "rejected",
  rejectionReason: string | null,
  actedBy: string,
) {
  const { data: contactRows } = await admin.rpc("get_vendor_contact", { p_vendor_id: vendorId });
  const contact = Array.isArray(contactRows) ? contactRows[0] : contactRows;
  if (!contact) return;

  const recipientName = contact.primary_contact_name || contact.company_name || "Vendor";
  const title = outcome === "approved"
    ? `Invoice ${invoiceNumber} approved`
    : `Invoice ${invoiceNumber} rejected`;
  const message = outcome === "approved"
    ? `Your invoice ${invoiceNumber} has been approved for payment. You'll be notified again once the payment is made.`
    : `Your invoice ${invoiceNumber} was rejected. Reason: ${rejectionReason || "Please contact the team for details."}`;
  const accentColor = outcome === "approved" ? "#16a34a" : "#dc2626";

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
    if (!emailRes.ok) console.error("Vendor outcome email failed:", await emailRes.text());
  }

  if (contact.mobile) {
    const { data: template } = await admin
      .from("whatsapp_templates")
      .select("status")
      .eq("template_name", VENDOR_WA_TEMPLATE_NAME)
      .maybeSingle();
    if (template?.status !== "approved") return;

    const { data: wsConfig } = await admin
      .from("whatsapp_settings")
      .select("exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, whatsapp_source_number")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!wsConfig?.exotel_sid || !wsConfig?.exotel_api_key || !wsConfig?.exotel_api_token || !wsConfig?.whatsapp_source_number) return;

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
              name: VENDOR_WA_TEMPLATE_NAME,
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
      tenant_id: tenantId,
      vendor_id: vendorId,
      phone_number: toPhone,
      direction: "outbound",
      template_name: VENDOR_WA_TEMPLATE_NAME,
      template_variables: { "1": recipientName, "2": message },
      message_content: message,
      status: logStatus,
      exotel_message_id: exotelMessageId,
      error_message: errorMessage,
      sent_by: actedBy,
      sent_at: logStatus === "sent" ? new Date().toISOString() : null,
    });
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token") || "";
      const action = url.searchParams.get("action");
      if (!token || (action !== "approve" && action !== "reject")) {
        return page("Invalid link", `<h1>Invalid link</h1><p class="row">This link is missing required information.</p>`);
      }

      const tokenRow = await loadToken(admin, token);
      if (!tokenRow) {
        return page("Invalid link", `<h1>Invalid link</h1><p class="row">This link is not valid. It may have already been used from a different device, or the invoice may have been removed.</p>`);
      }
      if (tokenRow.used_at) {
        return page("Already actioned", `<h1>Already actioned</h1><p class="row">This invoice has already been reviewed using this link.</p><p class="footer"><a class="link" href="${PORTAL_URL}">Open the portal</a></p>`);
      }
      if (new Date(tokenRow.expires_at) < new Date()) {
        return page("Link expired", `<h1>Link expired</h1><p class="row">This review link has expired. Please open the portal to review this invoice.</p><p class="footer"><a class="link" href="${PORTAL_URL}">Open the portal</a></p>`);
      }

      const { data: invoice } = await admin
        .from("vendor_invoices")
        .select("invoice_number, invoice_amount, invoice_date, description, status, vendor_id")
        .eq("id", tokenRow.invoice_id)
        .maybeSingle();
      if (!invoice) {
        return page("Not found", `<h1>Not found</h1><p class="row">This invoice could not be found.</p>`);
      }
      if (invoice.status !== "submitted" && invoice.status !== "under_review") {
        return page("Already reviewed", `<h1>Already reviewed</h1><p class="row">Invoice ${escapeHtml(invoice.invoice_number)} has already been marked <b>${escapeHtml(invoice.status)}</b> — no action needed.</p><p class="footer"><a class="link" href="${PORTAL_URL}">Open the portal</a></p>`);
      }

      const { data: vendor } = await admin.from("vendors").select("company_name").eq("id", invoice.vendor_id).maybeSingle();
      const amountText = `₹${Number(invoice.invoice_amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

      const summary = `
        <div class="row"><b>Invoice:</b> ${escapeHtml(invoice.invoice_number)}</div>
        <div class="row"><b>Vendor:</b> ${escapeHtml(vendor?.company_name || "-")}</div>
        <div class="row"><b>Amount:</b> ${amountText}</div>
        <div class="row"><b>Date:</b> ${escapeHtml(invoice.invoice_date)}</div>
        ${invoice.description ? `<div class="row"><b>Description:</b> ${escapeHtml(invoice.description)}</div>` : ""}
      `;

      if (action === "approve") {
        return page("Approve invoice", `
          <h1>Approve this invoice?</h1>
          ${summary}
          <form method="POST">
            <input type="hidden" name="token" value="${escapeHtml(token)}" />
            <input type="hidden" name="action" value="approve" />
            <button type="submit" class="approve">Confirm Approve</button>
          </form>
          <p class="footer"><a class="link" href="${PORTAL_URL}">Review full details in the portal instead</a></p>
        `);
      }

      return page("Reject invoice", `
        <h1>Reject this invoice?</h1>
        ${summary}
        <form method="POST">
          <input type="hidden" name="token" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="reject" />
          <label class="row" for="reason"><b>Reason (required)</b></label>
          <textarea id="reason" name="reason" required placeholder="Why is this invoice being rejected?"></textarea>
          <button type="submit" class="reject">Confirm Reject</button>
        </form>
        <p class="footer"><a class="link" href="${PORTAL_URL}">Review full details in the portal instead</a></p>
      `);
    }

    if (req.method === "POST") {
      const form = await req.formData();
      const token = String(form.get("token") || "");
      const action = String(form.get("action") || "");
      const reason = String(form.get("reason") || "").trim();

      if (!token || (action !== "approve" && action !== "reject")) {
        return page("Invalid request", `<h1>Invalid request</h1><p class="row">Missing required information.</p>`);
      }
      if (action === "reject" && !reason) {
        return page("Reject invoice", `
          <h1>Reject this invoice?</h1>
          <p class="error">A reason is required to reject an invoice.</p>
          <form method="POST">
            <input type="hidden" name="token" value="${escapeHtml(token)}" />
            <input type="hidden" name="action" value="reject" />
            <label class="row" for="reason"><b>Reason (required)</b></label>
            <textarea id="reason" name="reason" required placeholder="Why is this invoice being rejected?"></textarea>
            <button type="submit" class="reject">Confirm Reject</button>
          </form>
        `);
      }

      const tokenRow = await loadToken(admin, token);
      if (!tokenRow) {
        return page("Invalid link", `<h1>Invalid link</h1><p class="row">This link is not valid.</p>`);
      }
      if (tokenRow.used_at) {
        return page("Already actioned", `<h1>Already actioned</h1><p class="row">This invoice has already been reviewed using this link.</p>`);
      }
      if (new Date(tokenRow.expires_at) < new Date()) {
        return page("Link expired", `<h1>Link expired</h1><p class="row">This review link has expired. Please open the portal to review this invoice.</p>`);
      }

      const newStatus = action === "approve" ? "approved" : "rejected";
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        reviewed_by: tokenRow.staff_user_id,
        reviewed_at: new Date().toISOString(),
      };
      if (action === "reject") updatePayload.rejection_reason = reason;

      const { data: updated } = await admin
        .from("vendor_invoices")
        .update(updatePayload)
        .eq("id", tokenRow.invoice_id)
        .in("status", ["submitted", "under_review"])
        .select("invoice_number, vendor_id")
        .maybeSingle();

      await admin
        .from("invoice_action_tokens")
        .update({ used_at: new Date().toISOString(), used_action: newStatus })
        .eq("id", tokenRow.id);

      if (!updated) {
        return page("Already reviewed", `<h1>Already reviewed</h1><p class="row">This invoice was already reviewed by someone else before your response was recorded.</p><p class="footer"><a class="link" href="${PORTAL_URL}">Open the portal</a></p>`);
      }

      notifyVendorOfOutcome(
        admin,
        resendApiKey,
        updated.vendor_id,
        tokenRow.tenant_id,
        updated.invoice_number,
        newStatus,
        action === "reject" ? reason : null,
        tokenRow.staff_user_id,
      ).catch((e) => console.error("Vendor outcome notification failed:", e));

      const accent = action === "approve" ? "#16a34a" : "#dc2626";
      return page("Done", `
        <h1 style="color:${accent}">Invoice ${action === "approve" ? "approved" : "rejected"}</h1>
        <p class="row">Invoice ${escapeHtml(updated.invoice_number)} has been marked <b>${newStatus}</b>. The vendor has been notified.</p>
        <p class="footer"><a class="link" href="${PORTAL_URL}">Open the portal</a></p>
      `);
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    console.error("invoice-approval-action failed:", error);
    return page("Something went wrong", `<h1>Something went wrong</h1><p class="row">Please try again, or open the portal to review this invoice.</p><p class="footer"><a class="link" href="${PORTAL_URL}">Open the portal</a></p>`);
  }
});
