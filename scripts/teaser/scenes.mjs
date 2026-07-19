// Vendor-Sync teaser — v2 "1 main + 3 subsets" (approved storytelling standard).
//   MAIN    — Vendor-Sync ends both chases (documents + payments); your team keeps every decision
//   SUBSET 1 — trust before money (live govt verification, duplicates/fraud flagged)
//   SUBSET 2 — invoices file themselves (vendor uploads, AI reads, one review queue)
//   SUBSET 3 — the chasing stops (vendors auto-notified on WhatsApp + email)
// Hook card names pain + product first; three numbered chapters; close restates
// main + subsets + real pricing (₹500/vendor/mo, 5 free) + demo-only CTA.
//
// Safety: every scene is VIEW-ONLY against the In-Sync Demo tenant. No approve/reject
// clicks (those now notify vendors), no OTP sends, no payment recording. The vendor
// upload scene signs in via an admin-minted magic link — nothing is emailed, and the
// invoice dialog is Escaped, never submitted.
import { fileURLToPath } from 'url';
import { loadEnv } from './lib/env.mjs';
import { ACCT } from './lib/scene.mjs';
import { BASE } from './lib/app.mjs';
import { clickLocator, moveToLocator } from './lib/cursor.mjs';
import { ring, removeAnn, caption, removeCaption } from './lib/annotate.mjs';

const env = loadEnv(new URL('../../.env', import.meta.url));
const sleep = (page, ms) => page.waitForTimeout(ms);

// Legacy service_role JWT (the GoTrue admin API wants a JWT, sb_secret may not do) —
// fetched once via the Management API.
async function legacyServiceKey() {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${env.VITE_SUPABASE_PROJECT_ID}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } },
  );
  const keys = await r.json();
  const sr = keys.find((k) => k.name === 'service_role');
  if (!sr?.api_key) throw new Error('service_role key not found');
  return sr.api_key;
}

// Magic link for the demo vendor (Saffron Textiles / anita@…example.com) so the
// upload scene can show a real signed-in view without sending anything.
async function vendorMagicLink() {
  const key = await legacyServiceKey();
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'magiclink',
      email: 'anita@saffrontextiles.example.com',
      options: { redirect_to: 'https://vendor.in-sync.co.in/vendor/portal/dashboard' },
    }),
  });
  const j = await r.json();
  if (!j.action_link) throw new Error(`generate_link failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.action_link;
}

const BLUE = '#0066B3';
const INVOICE_PDF = fileURLToPath(new URL('./assets/stm-invoice-027.pdf', import.meta.url));

// Shared vendor sign-in for the portal scene: admin-minted magic link (no sends),
// landing on the live dashboard.
async function vendorSession(page) {
  const link = await vendorMagicLink();
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3500); // let the SPA store the session from the URL hash
  await page.goto('https://vendor.in-sync.co.in/vendor/portal/dashboard', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByText(/outstanding|settled|invoices submitted/i).first().waitFor({ timeout: 20000 });
  // data, not just layout: wait for real invoice rows so the camera never sees ₹0 placeholders
  await page.getByText(/STM\/25-26/).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
}

const brandCard = (title, subtitle, foot) => `(() => {
  const c = document.createElement('div'); c.id='__brandcard';
  c.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,hsl(210,45%,13%),hsl(204,100%,28%) 60%,hsl(204,100%,20%));opacity:0;transition:opacity .8s';
  c.innerHTML="<div style=\\"font:700 18px 'Segoe UI',sans-serif;color:#9fd468;letter-spacing:3px;text-transform:uppercase\\">Vendor-Sync \\u00B7 Vendor Lifecycle Platform</div>"+
    "<div style=\\"font:800 56px 'Segoe UI',sans-serif;color:#fff;letter-spacing:-1.5px;margin-top:20px;max-width:1040px;text-align:center;line-height:1.18\\">${title}</div>"+
    "<div style=\\"font:500 26px 'Segoe UI',sans-serif;color:rgba(255,255,255,.92);margin-top:20px;max-width:940px;text-align:center\\">${subtitle}</div>"+
    "<div style=\\"font:600 17px 'Segoe UI',sans-serif;color:#9fd468;margin-top:30px\\">${foot}</div>";
  document.documentElement.appendChild(c);
  requestAnimationFrame(()=>{c.style.opacity='1';});
})()`;

// Closing card: main + the three subsets, then price + demo CTA.
// Benchmarks stated conservatively (manual vendor onboarding runs days of chasing).
const numbersCard = `(() => {
  const c = document.createElement('div'); c.id='__numcard';
  c.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,hsl(210,45%,13%),hsl(204,100%,28%) 60%,hsl(204,100%,20%));opacity:0;transition:opacity .8s';
  const row = (before, after) =>
    '<div style="font:400 21px \\'Segoe UI\\',sans-serif;color:rgba(255,255,255,.55);padding:14px 24px;display:flex;align-items:center;justify-content:flex-end;text-align:right">'+before+'</div>'+
    '<div style="font:600 21px \\'Segoe UI\\',sans-serif;color:#9fd468;padding:14px 24px;border-left:1px solid rgba(255,255,255,.14);display:flex;align-items:center">'+after+'</div>';
  c.innerHTML =
    '<div style="font:700 18px \\'Segoe UI\\',sans-serif;color:#9fd468;letter-spacing:3px;text-transform:uppercase">Vendor-Sync</div>'+
    '<div style="font:800 56px \\'Segoe UI\\',sans-serif;color:#fff;letter-spacing:-1.5px;margin-top:16px;text-align:center;line-height:1.15">Both chases end.<br>You keep the decisions.</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;margin-top:36px;background:rgba(255,255,255,.06);border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.12)">'+
      row('Days of chasing documents','Verified same afternoon \\u2014 live govt sources')+
      row('Invoices keyed by hand','AI reads them \\u2014 one queue, your team approves')+
      row('"Payment status?" calls all month','Vendors auto-notified \\u2014 WhatsApp + email')+
    '</div>'+
    '<div style="font:600 23px \\'Segoe UI\\',sans-serif;color:rgba(255,255,255,.92);margin-top:32px">From \\u20B9500 per vendor / month \\u00B7 first 5 verifications free</div>'+
    '<div style="font:600 19px \\'Segoe UI\\',sans-serif;color:#9fd468;margin-top:12px">vendor.in-sync.co.in \\u00B7 Book a demo \\u2014 see it on your own vendors</div>';
  document.documentElement.appendChild(c);
  requestAnimationFrame(()=>{c.style.opacity='1';});
})()`;

// WhatsApp-style notification bubble, slid in from the right.
const waBubble = `(() => {
  const c = document.createElement('div'); c.id='__wab';
  c.style.cssText='position:fixed;right:40px;top:96px;width:360px;z-index:2147483646;opacity:0;transform:translateX(90px);transition:opacity .5s,transform .55s cubic-bezier(.22,1.2,.36,1)';
  c.innerHTML='<div style="background:#075E54;color:#fff;font:700 13px Segoe UI,sans-serif;padding:9px 14px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:8px"><span style="width:9px;height:9px;border-radius:50%;background:#25D366;display:inline-block"></span>WhatsApp · Vendor-Sync</div>'+
    '<div style="background:#DCF8C6;color:#111;font:400 14px Segoe UI,sans-serif;padding:13px 15px;border-radius:0 0 12px 12px;box-shadow:0 18px 45px rgba(0,0,0,.35);line-height:1.5">Hi Anita, here\\'s an update on your invoice: <b>\\u20B995,640 paid against INV-2047.</b> Log in to the Vendor-Sync portal for the full breakup.<div style="text-align:right;font-size:11px;color:#5b7a58;margin-top:6px">just now \\u2713\\u2713</div></div>';
  document.documentElement.appendChild(c);
  requestAnimationFrame(()=>{c.style.opacity='1';c.style.transform='translateX(0)';});
})()`;

export const SCENES = [

// ── 0. HOOK — pain + product named up front ──────────────────────
{
  name: 'v0-hook', account: ACCT.guest,
  narration: "Every month, two chases: your team chasing vendor documents, and vendors chasing payments. Vendor-Sync ends both — and your team keeps every decision.",
  beats: async ({ page, D, ready }) => {
    await page.goto('about:blank').catch(() => {});
    await page.evaluate(brandCard(
      'Two chases, every month.<br>Vendor-Sync ends both.',
      'Documents chase themselves in. Payments explain themselves out. Your team keeps every decision.',
      'vendor.in-sync.co.in',
    ));
    const waitUntil = await ready(300);
    await waitUntil(D);
  },
},

// ── 1. SUBSET 1 — trust before money ─────────────────────────────
{
  name: 'v1-verify', account: ACCT.staff,
  narration: "One — trust before money. Every new vendor's PAN, GST and bank account are verified against live government sources — duplicates and tampered documents flagged before a single rupee moves.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/queue`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/approval queue/i).first().waitFor({ timeout: 25000 });
    // the approver's default tab is empty — switch to the Approve tab (has vendors)
    const approveTab = page.getByRole('tab', { name: /approve/i }).first()
      .or(page.getByText(/^Approve$/).first());
    await approveTab.waitFor({ timeout: 15000 });
    const waitUntil = await ready(400);
    await clickLocator(page, approveTab, { dur: 700 });
    await page.getByText(/Metro Trade|Konkan Agro/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    await waitUntil(at('verified against', 5));
    await page.evaluate(() => window.scrollBy({ top: 160, behavior: 'smooth' }));
    await waitUntil(at('duplicates', 9, -0.4));
    // SPA-navigate via the sidebar so the shell stays on screen (no boot spinner)
    await clickLocator(page, page.getByRole('link', { name: /fraud alerts/i }).first(), { dur: 600 });
    await page.getByText(/fraud/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 700);
    const cap = await caption(page, 'One · Duplicate GST, PAN & bank accounts — caught automatically');
    await waitUntil(D - 0.4);
    await removeCaption(page, cap);
  },
},

// ── 2a. SUBSET 2 — invoices file themselves (AI reads on camera) ─
{
  name: 'v2a-upload', account: ACCT.guest,
  narration: "Two — invoices file themselves. The vendor uploads the file; the AI reads it — number, date, amount — and fills the form.",
  beats: async ({ page, at, D, ready }) => {
    await vendorSession(page);
    const waitUntil = await ready(200);
    // front-load the actions so the AI-filled form holds the screen for the scene's back half
    const uploadBtn = page.getByRole('button', { name: /upload invoice/i }).first();
    await clickLocator(page, uploadBtn, { dur: 400 });
    await page.locator('#inv-file').waitFor({ timeout: 15000 });
    await page.locator('#inv-file').setInputFiles(INVOICE_PDF);
    // the real Groq read happens here, on camera
    await page.getByText(/Auto-filled by AI/i).waitFor({ timeout: 30000 });
    const filled = page.getByText(/Auto-filled by AI/i).first();
    await ring(page, filled, { label: 'Read by AI — vendor just confirms' }).catch(() => {});
    await waitUntil(D);
    // never submit — close so no invoice row is created
    await page.keyboard.press('Escape');
  },
},

// ── 2b. …one review queue, your team decides ─────────────────────
{
  name: 'v2b-queue', account: ACCT.staff,
  narration: "It lands in one review queue — your team approves, or rejects with a reason. The judgment stays yours.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/invoices`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Vendor Invoices/i).first().waitFor({ timeout: 25000 });
    const waitUntil = await ready(1100);
    await waitUntil(at('your team approves', 3, -0.4));
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await waitUntil(D);
  },
},

// ── 3. SUBSET 3 — the chasing stops ──────────────────────────────
{
  name: 'v3-notify', account: ACCT.staff,
  narration: "Three — the chasing stops. The moment anything changes, your vendor already knows — WhatsApp and email, automatic. The payment-status calls end.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/invoice-analytics`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Invoice Analytics/i).first().waitFor({ timeout: 25000 });
    await sleep(page, 2500); // let ECharts draw
    const waitUntil = await ready(600);
    await waitUntil(at('anything changes', 3));
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await waitUntil(at('already knows', 5, -0.5));
    await page.evaluate(waBubble);
    await waitUntil(D);
  },
},

// ── 4. CLOSE — restate main + subsets, price, demo CTA ───────────
// CTA matches the website ("book a demo" — no self-serve signup) and the real
// free tier (5, not 3).
{
  name: 'v4-close', account: ACCT.guest,
  narration: "That's Vendor-Sync: vendors verified before money moves, invoices that file themselves, and follow-up calls that stop — you keep the decisions. From five hundred rupees per vendor a month, first five verifications free. Book a demo — see it on your own vendors.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto('about:blank').catch(() => {});
    await page.evaluate(numbersCard);
    const waitUntil = await ready(300);
    await waitUntil(D);
  },
},
];
