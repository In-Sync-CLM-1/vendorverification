// Vendor-Sync app access for the promo camera.
// pages.dev origin: same build as the custom domain, no zone bot-challenge risk.
export const BASE = 'https://vendorverification-sync.pages.dev';

export async function login(page, email, password) {
  await page.goto(`${BASE}/staff/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]:visible').first().fill(email);
  await page.locator('input[type=password]:visible').first().fill(password);
  await page.locator('button[type=submit]:visible').first().click();
  await page.waitForURL(/staff\/(dashboard|invoices|queue)/, { timeout: 30000 });
  await page.waitForTimeout(1200);
}
