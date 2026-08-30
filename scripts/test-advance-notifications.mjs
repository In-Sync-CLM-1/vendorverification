/**
 * One-off manual test: fires real email + WhatsApp sends for the two advance
 * request notifications (approver-submitted, vendor-decision) to the
 * standing ops test channels, using the exact same HTML/payload shape as the
 * live edge functions. Does not touch any real vendor/staff data.
 *
 * WhatsApp for staff_advance_request_submitted_v1 / vendor_advance_decision_v1
 * is expected to fail right now — those templates are still pending Meta
 * review (see scripts/create-advance-*-template.mjs). Sent anyway so the
 * real rejection reason is visible rather than assumed.
 *
 *   node scripts/test-advance-notifications.mjs
 */
import fs from "node:fs";
import path from "node:path";

const OPS_EMAIL = "a@in-sync.co.in";
const OPS_PHONE = "+917738919680";

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = readEnv(path.join(process.cwd(), ".env"));

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.VITE_SUPABASE_PROJECT_ID}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json", "User-Agent": "curl/8" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

async function sendEmail(subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "Vendor-Sync <noreply@in-sync.co.in>",
      to: [OPS_EMAIL],
      subject: `[TEST] ${subject}`,
      html,
    }),
  });
  const text = await res.text();
  console.log(`EMAIL "${subject}" ->`, res.status, res.ok ? "sent" : text.slice(0, 300));
}

// Redefine Marcom (467ce2a0-5df8-40a7-81d6-ccdc77b66ce9) is the only real
// tenant using this app — its own WhatsApp sender number, not the seeded
// "In-Sync" demo tenant's, is what real vendors/staff actually see.
const REAL_TENANT_ID = "467ce2a0-5df8-40a7-81d6-ccdc77b66ce9";

async function sendWhatsapp(templateName, params) {
  const [settings] = await sql(
    `SELECT exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, waba_id, whatsapp_source_number
       FROM public.whatsapp_settings WHERE tenant_id = '${REAL_TENANT_ID}' AND is_active = true LIMIT 1;`
  );
  const sub = settings.exotel_subdomain || "api.exotel.com";
  const auth = "Basic " + Buffer.from(`${settings.exotel_api_key}:${settings.exotel_api_token}`).toString("base64");
  const toPhone = OPS_PHONE.replace("+", "");
  const fromNumber = settings.whatsapp_source_number.replace("+", "");

  const payload = {
    custom_data: toPhone,
    whatsapp: {
      messages: [{
        from: fromNumber,
        to: toPhone,
        content: {
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
          },
        },
      }],
    },
  };

  const res = await fetch(`https://${sub}/v2/accounts/${settings.exotel_sid}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let summary = text.slice(0, 300);
  let sid = null;
  try {
    const j = JSON.parse(text);
    const msg = j?.response?.whatsapp?.messages?.[0];
    sid = msg?.data?.sid ?? msg?.data?.id ?? null;
    summary = msg?.error_data?.description || msg?.error_data?.message || `accepted (code ${msg?.code}), sid ${sid}`;
  } catch {
    // keep raw text summary
  }
  console.log(`WHATSAPP "${templateName}" -> HTTP ${res.status} ·`, summary);
  return sid;
}

// --- 1. Approver-facing: "advance request submitted" -----------------------
await sendEmail(
  "Advance request from Prosync AI Solutions awaiting your approval - Vendor-Sync",
  `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066B3;">
        <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
      </div>
      <div style="padding: 30px 0;">
        <p>Dear <strong>Manoj Mishra</strong>,</p>
        <p>A vendor has requested an advance against a PI/Quotation you approved.</p>
        <div style="background-color: #f8f9fa; border-left: 4px solid #0066B3; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin: 0 0 8px 0; color: #0066B3;">Advance requested: ₹45,000</h3>
          <p style="margin: 4px 0; color: #333;">Vendor: Prosync AI Solutions</p>
          <p style="margin: 4px 0; color: #333;">Against: Proforma Invoice · RMPL-26-999</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://vendor.in-sync.co.in/staff/advance-requests" style="background-color: #0066B3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Review Request
          </a>
        </div>
      </div>
      <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
        <p>This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `
);
await sendWhatsapp("staff_advance_request_submitted_v1", ["Manoj Mishra", "Prosync AI Solutions", "Rs 45,000", "Proforma Invoice · RMPL-26-999"]);

// --- 2. Vendor-facing: "advance request approved" ---------------------------
await sendEmail(
  "Advance request approved: ₹45,000 - Vendor-Sync",
  `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #16a34a;">
        <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
      </div>
      <div style="padding: 30px 0;">
        <p>Dear <strong>Prosync AI Solutions</strong>,</p>
        <div style="background-color: #f8f9fa; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin: 0 0 8px 0; color: #16a34a;">Advance request approved: ₹45,000</h3>
          <p style="margin: 0; color: #333;">Your advance request of ₹45,000 against "Proforma Invoice · RMPL-26-999" has been approved. It will be adjusted against a future invoice.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://vendor.in-sync.co.in/vendor/portal/dashboard" style="background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Open Vendor Portal
          </a>
        </div>
      </div>
      <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
        <p>This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `
);
await sendWhatsapp("vendor_advance_decision_v1", ["Prosync AI Solutions", "Your advance request of Rs 45,000 has been approved."]);

// --- 3. Proof the WhatsApp pipeline itself works, via the one template
//        Meta has already approved (pi_quotation_submitted_v1) ------------
await sendWhatsapp("pi_quotation_submitted_v1", ["Manoj Mishra", "Prosync AI Solutions", "Proforma Invoice", "Rs 45,000", "RMPL-26-999"]);
