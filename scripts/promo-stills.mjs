// Capture crisp module stills for the premium promo (device-frame hero shots).
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { login, BASE } from './lib/app.mjs';
import { loadEnv } from './lib/env.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const env = loadEnv(new URL('../.env', import.meta.url));
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'assets', 'promo');
mkdirSync(out, { recursive: true });

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const VP = { width: 1600, height: 1000 };

const dismissToasts = async (p) => {
  for (const b of await p.locator('[toast-close]').all()) await b.click().catch(() => {});
  await p.waitForTimeout(300);
};

const makeShot = (p) => async (name, extra) => {
  await p.mouse.move(2, 2);
  await p.waitForTimeout(600);
  if (extra) await extra(p).catch((e) => console.error(`  ${name} extra failed:`, e.message));
  await dismissToasts(p);
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(out, `${name}.png`) });
  console.log('  shot', name);
};

const browser = await chromium.launch({ headless: true });

// ── as staff (echocommunicator@gmail.com, tenant = Saffron Textiles' tenant):
// Fraud Alerts + Invoice Analytics ──────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = makeShot(page);
  await login(page, env.VV_ADMIN_EMAIL, env.VV_ADMIN_PASSWORD);

  await page.goto(`${BASE}/staff/fraud-alerts`, { waitUntil: 'networkidle' });
  await page.getByText(/Fraud Detection/i).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot('verify');

  await page.goto(`${BASE}/staff/invoice-analytics`, { waitUntil: 'networkidle' });
  await page.getByText(/Invoice Analytics/i).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2200); // let echarts draw
  await shot('outcome');

  await ctx.close();
}

// ── as the vendor (Anita / Saffron Textiles Mills) — magic-link session,
// since the portal is OTP-only and can't be scripted through the UI ─────────
{
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: 'anita@saffrontextiles.example.com',
    options: { redirectTo: `${BASE}/vendor/portal/dashboard` },
  });
  if (error) throw error;
  const actionLink = data.properties.action_link;

  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = makeShot(page);

  await page.goto(actionLink, { waitUntil: 'load' });
  await page.getByText(/Your Invoices/i).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot('continuity');

  // "ease" — live AI invoice read. The page has a hidden file input elsewhere
  // (a different dialog's), so target only the visible one in this modal.
  await page.getByRole('button', { name: /upload invoice/i }).first().click();
  await page.waitForTimeout(500);
  await page.locator('input[type="file"]:visible').first().setInputFiles(join(here, 'assets', 'sample-invoice.png'));
  console.log('  waiting for AI invoice read...');
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const stillReading = await page.getByText(/reading invoice/i).count();
    if (stillReading === 0) break;
  }
  await shot('ease');

  await ctx.close();
}

await browser.close();
console.log('done');
