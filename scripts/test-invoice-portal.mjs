// End-to-end test of the vendor invoice portal:
// OTP login (email) -> vendor link -> file upload to R2 -> invoice submit ->
// staff approve -> record payment (advance/GST/TDS/payout) -> status rolls to paid
// -> vendor sees the breakup. Cleans up its own test rows.
//
// Run: node scripts/test-invoice-portal.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

const VENDOR_CODE = "INS-2026-0002"; // Saffron Textiles (In-Sync Demo, fake .example.com email)
let failures = 0;
const step = (name, ok, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

// ── 1. vendor email (decrypted view, service role) ──
const { data: vdec, error: vErr } = await admin
  .from("vendors_decrypted")
  .select("id, primary_email")
  .eq("vendor_code", VENDOR_CODE)
  .single();
const { data: vten } = vdec
  ? await admin.from("vendors").select("tenant_id").eq("id", vdec.id).single()
  : { data: null };
const vrow = vdec && vten ? { ...vdec, tenant_id: vten.tenant_id } : null;
step("Fetch demo vendor", !!vrow && !vErr, vErr?.message);
if (!vrow) process.exit(1);
const email = vrow.primary_email.toLowerCase().trim();

// ── 2. send OTP (vendor_portal purpose) ──
const { data: sendData, error: sendErr } = await anon.functions.invoke("send-public-otp", {
  body: { identifier: email, identifierType: "email", purpose: "vendor_portal" },
});
step("send-public-otp (vendor_portal)", !sendErr && sendData?.success, sendErr?.message || sendData?.error);
if (!sendData?.success) process.exit(1);

// ── 3. read OTP back (service role) ──
const { data: otpRow } = await admin
  .from("public_otp_verifications")
  .select("otp_code")
  .eq("session_id", sendData.sessionId)
  .single();
step("Read OTP from DB", !!otpRow?.otp_code);

// ── 4. verify OTP -> token hash ──
const { data: verifyData, error: verifyErr } = await anon.functions.invoke("verify-public-otp", {
  body: { sessionId: sendData.sessionId, otp: otpRow.otp_code },
});
step("verify-public-otp", !verifyErr && verifyData?.verified && !!verifyData?.tokenHash, verifyErr?.message || verifyData?.error);
if (!verifyData?.tokenHash) process.exit(1);

// ── 5. exchange for a session ──
const vendorClient = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: sess, error: sessErr } = await vendorClient.auth.verifyOtp({
  token_hash: verifyData.tokenHash,
  type: "magiclink",
});
step("Magic-link session", !!sess?.session && !sessErr, sessErr?.message);
const accessToken = sess.session.access_token;
const userId = sess.session.user.id;

// ── 6. vendor_users link created with correct vendor ──
const { data: link } = await admin
  .from("vendor_users")
  .select("vendor_id, tenant_id")
  .eq("user_id", userId)
  .maybeSingle();
step("vendor_users link", link?.vendor_id === vrow.id, link ? "" : "no link row");

// ── 7. upload a file to R2 via the proxy ──
const pdfBytes = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
);
const form = new FormData();
form.append("file", new File([pdfBytes], "e2e-test-invoice.pdf", { type: "application/pdf" }));
const upResp = await fetch(`${URL_}/functions/v1/vendor-invoice-file`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON },
  body: form,
});
const upData = await upResp.json();
step("R2 upload via proxy", upResp.ok && !!upData.file_key, JSON.stringify(upData).slice(0, 120));
const fileKey = upData.file_key;

// ── 8. submit invoice under RLS as the vendor ──
const invoiceNumber = `E2E-${Date.now()}`;
const { data: inv, error: invErr } = await vendorClient
  .from("vendor_invoices")
  .insert({
    vendor_id: vrow.id,
    tenant_id: "00000000-0000-0000-0000-000000000000", // overwritten by trigger
    invoice_number: invoiceNumber,
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_amount: 11800,
    gst_amount: 1800,
    description: "E2E test invoice",
    po_number: "E2E-PO-1",
    invoice_file_key: fileKey,
  })
  .select("id, status, tenant_id")
  .single();
step("Vendor submits invoice (RLS)", !!inv && inv.status === "submitted" && inv.tenant_id === vrow.tenant_id, invErr?.message);
if (!inv) process.exit(1);

// ── 9. download the file back ──
const dlResp = await fetch(`${URL_}/functions/v1/vendor-invoice-file?key=${encodeURIComponent(fileKey)}`, {
  headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON },
});
step("R2 download via proxy", dlResp.ok && (dlResp.headers.get("content-type") || "").includes("pdf"), `HTTP ${dlResp.status}`);

// ── 10. staff approves + records payment breakup ──
const staffClient = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: staffSess, error: staffErr } = await staffClient.auth.signInWithPassword({
  email: env.VV_MAKER_EMAIL,
  password: env.VV_MAKER_PASSWORD,
});
step("Staff login", !!staffSess?.session, staffErr?.message);

let staffDb = staffClient;
if (!staffSess?.session) {
  console.log("   (falling back to service role for staff actions)");
  staffDb = admin;
}

const { error: apprErr } = await staffDb
  .from("vendor_invoices")
  .update({ status: "approved", reviewed_at: new Date().toISOString() })
  .eq("id", inv.id);
step("Staff approves invoice", !apprErr, apprErr?.message);

const { error: payErr } = await staffDb.from("vendor_invoice_payments").insert({
  invoice_id: inv.id,
  tenant_id: "00000000-0000-0000-0000-000000000000", // overwritten by trigger
  vendor_id: vrow.id,
  payment_date: new Date().toISOString().slice(0, 10),
  advance_adjusted: 1000,
  gst_amount: 1800,
  tds_amount: 200,
  payout_amount: 10600,
  utr_reference: "E2E-UTR-1",
  remarks: "E2E test payment",
  is_full_settlement: true,
});
step("Record payment breakup", !payErr, payErr?.message);

// ── 11. invoice rolled to paid ──
const { data: after } = await admin.from("vendor_invoices").select("status").eq("id", inv.id).single();
step("Invoice status -> paid", after?.status === "paid", `status=${after?.status}`);

// ── 12. vendor sees the payment breakup ──
const { data: vendorView } = await vendorClient
  .from("vendor_invoice_payments")
  .select("advance_adjusted, gst_amount, tds_amount, payout_amount, total_settled")
  .eq("invoice_id", inv.id);
const p = vendorView?.[0];
step(
  "Vendor sees breakup",
  !!p && Number(p.advance_adjusted) === 1000 && Number(p.tds_amount) === 200 && Number(p.payout_amount) === 10600 && Number(p.total_settled) === 11800,
  JSON.stringify(p)
);

// ── cleanup test rows + R2 object ──
await admin.from("vendor_invoice_payments").delete().eq("invoice_id", inv.id);
await admin.from("vendor_invoices").delete().eq("id", inv.id);
const cfResp = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/vendorverification-files/objects/${fileKey}`,
  { method: "DELETE", headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } }
);
console.log(`🧹 cleanup: rows deleted, R2 object delete HTTP ${cfResp.status}`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
