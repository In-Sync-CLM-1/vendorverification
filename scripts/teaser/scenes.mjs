// Vendor-Sync teaser (~90s, 8 scenes) — the LIFECYCLE story, not a verification tour.
// Arc: two-chases hook -> trust (verify + fraud) -> approval trail -> vendor portal ->
// AI invoices -> settlement breakup + bank-statement matching -> analytics + auto
// notifications ("the calls stop") -> brand close.
//
// Safety: every scene is VIEW-ONLY against the In-Sync Demo tenant. No approve/reject
// clicks (those now notify vendors), no OTP sends, no payment recording. The vendor
// portal scene signs in via an admin-minted magic link — nothing is emailed.
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
// portal-dashboard scene can show a real signed-in view without sending anything.
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

const brandCard = (title, subtitle, foot) => `(() => {
  const c = document.createElement('div'); c.id='__brandcard';
  c.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,hsl(210,45%,13%),hsl(204,100%,28%) 60%,hsl(204,100%,20%));opacity:0;transition:opacity .8s';
  c.innerHTML="<div style=\\"font:800 60px 'Segoe UI',sans-serif;color:#fff;letter-spacing:-1.5px\\">${title}</div>"+
    "<div style=\\"font:500 26px 'Segoe UI',sans-serif;color:rgba(255,255,255,.92);margin-top:16px;max-width:940px;text-align:center\\">${subtitle}</div>"+
    "<div style=\\"font:600 17px 'Segoe UI',sans-serif;color:#9fd468;margin-top:30px\\">${foot}</div>";
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

// ── 1. HOOK — the two chases ─────────────────────────────────────
{
  name: 's0-hook', account: ACCT.guest,
  narration: "Every growing business runs on vendors. And every month brings the same two chases — your team chasing documents, and your vendors chasing payments. Vendor-Sync ends both.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByText(/From first invite/i).first().waitFor({ timeout: 25000 });
    const waitUntil = await ready(800);
    await waitUntil(at('your team chasing', 5.5));
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await waitUntil(at('Vendor-Sync ends', 10, -0.2));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await waitUntil(D);
  },
},

// ── 2. TRUST — verification + fraud ──────────────────────────────
{
  name: 's1-verify', account: ACCT.staff,
  narration: "It starts with trust. Every new vendor's PAN, GST and bank account are verified against live government sources. Duplicates and tampered documents are flagged before you commit a single rupee.",
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
    await waitUntil(at('Duplicates', 9, -0.4));
    // SPA-navigate via the sidebar so the shell stays on screen (no boot spinner)
    await clickLocator(page, page.getByRole('link', { name: /fraud alerts/i }).first(), { dur: 600 });
    await page.getByText(/fraud/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 700);
    const cap = await caption(page, 'Duplicate GST, PAN & bank accounts — caught automatically');
    await waitUntil(D - 0.4);
    await removeCaption(page, cap);
  },
},

// ── 3. GOVERNANCE — the approval trail ───────────────────────────
{
  name: 's2-trail', account: ACCT.staff,
  narration: "Reviews flow maker to checker to approver — and the audit trail writes itself.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/vendors`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/vendor/i).first().waitFor({ timeout: 25000 }).catch(() => {});
    const waitUntil = await ready(1100);
    await waitUntil(at('audit trail', 3.5));
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await waitUntil(D);
  },
},

// ── 4. THE PORTAL — vendor's own view ────────────────────────────
{
  name: 's3-portal', account: ACCT.guest,
  narration: "Approved vendors get their own portal. No passwords — a one-time code, and they see every invoice and every payment, always current.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/vendor/portal`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/vendor|login|code/i).first().waitFor({ timeout: 25000 }).catch(() => {});
    const waitUntil = await ready(900);
    await waitUntil(at('one-time code', 4.5, -0.3));
    // Signed-in dashboard via an admin-minted magic link (nothing is sent anywhere).
    try {
      const link = await vendorMagicLink();
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(page, 3500); // let the SPA store the session from the URL hash
      await page.goto('https://vendor.in-sync.co.in/vendor/portal/dashboard', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.getByText(/outstanding|settled|invoices submitted/i).first().waitFor({ timeout: 20000 });
      await sleep(page, 600);
      await page.evaluate(() => window.scrollBy({ top: 180, behavior: 'smooth' }));
    } catch (e) {
      console.log('[s3-portal] dashboard fallback:', e.message.split('\n')[0]);
    }
    await waitUntil(D);
  },
},

// ── 5. INVOICES — AI-read, one queue ─────────────────────────────
{
  name: 's4-invoices', account: ACCT.staff,
  narration: "Invoices come in from the portal. AI reads each file and fills in the details — your team approves from one queue.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/invoices`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Vendor Invoices/i).first().waitFor({ timeout: 25000 });
    const waitUntil = await ready(1100);
    await waitUntil(at('your team approves', 6, -0.4));
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await waitUntil(D);
  },
},

// ── 6. SETTLEMENT — the breakup + bank-statement matching ────────
{
  name: 's5-settle', account: ACCT.staff,
  narration: "Payments carry the full breakup — advance, GST, TDS, payout. Or match an entire bank statement to open invoices in one screen.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/invoices`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Vendor Invoices/i).first().waitFor({ timeout: 25000 });
    // open a PAID invoice's detail (view-only) to show the breakup table
    const paidRow = page.locator('tr', { hasText: 'Paid' }).first();
    await paidRow.waitFor({ timeout: 20000 });
    const waitUntil = await ready(400);
    await clickLocator(page, paidRow, { dur: 700 });
    await sleep(page, 900);
    await waitUntil(at('Or match', 6.5, -0.3));
    await page.keyboard.press('Escape');
    await sleep(page, 400);
    // SPA-navigate via the sidebar so the shell stays on screen (no boot spinner)
    await clickLocator(page, page.getByRole('link', { name: /match payments/i }).first(), { dur: 600 });
    await page.getByText(/bank statement/i).first().waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(page, 500);
    const box = page.locator('textarea').first();
    await moveToLocator(page, box, 600).catch(() => {});
    await box.click().catch(() => {});
    await page.keyboard.type('12-07-2026  NEFT TO SAFFRON TEXTILES  18,500.00  UTR2607120001', { delay: 18 }).catch(() => {});
    await waitUntil(D);
  },
},

// ── 7. VISIBILITY — analytics + the calls stop ───────────────────
{
  name: 's6-analytics', account: ACCT.staff,
  narration: "Analytics track invoiced versus settled across every vendor. And the moment anything changes, your vendor already knows — on WhatsApp and email. The follow-up calls stop.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(`${BASE}/staff/invoice-analytics`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Invoice Analytics/i).first().waitFor({ timeout: 25000 });
    await sleep(page, 2500); // let ECharts draw
    const waitUntil = await ready(600);
    await waitUntil(at('across every vendor', 4.5));
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await waitUntil(at('already knows', 8, -0.5));
    await page.evaluate(waBubble);
    await waitUntil(D);
  },
},

// ── 8. CLOSE — the brand line ────────────────────────────────────
{
  name: 's7-outro', account: ACCT.guest,
  narration: "Vendor-Sync, by In-Sync. From first invite, to final settlement. Start free today — your first three verifications are on us.",
  beats: async ({ page, at, D, ready }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByText(/From first invite/i).first().waitFor({ timeout: 25000 });
    const waitUntil = await ready(600);
    await waitUntil(at('From first invite', 2.2, -0.4));
    await page.evaluate(brandCard(
      'Vendor-Sync',
      'From first invite to final settlement.',
      'vendor.in-sync.co.in  ·  3 free verifications — no card required',
    ));
    await waitUntil(D);
  },
},
];
