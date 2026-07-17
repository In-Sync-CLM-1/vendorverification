// Scene runner for the continuous-narration teaser: pre-auth -> record video only,
// paced to a slot of the single master narration. Each scene supplies narration +
// a beats() callback that calls ready() once the opening frame is on screen.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadEnv } from './env.mjs';
import * as V from './video.mjs';
import { installCursor } from './cursor.mjs';
import { login } from './app.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'recordings', 'scenes');
const env = loadEnv(new URL('../../../.env', import.meta.url));
const VP = { width: 1366, height: 768 };

export const ACCT = {
  staff: { email: env.VV_APPROVER_EMAIL, password: env.VV_APPROVER_PASSWORD }, // In-Sync Demo approver
  guest: { guest: true },
};

export async function recordSceneVideo({ scene, slotStart, slotDuration, localFind, tailT = 0.5 }) {
  const browser = await chromium.launch({ headless: true });
  let storageState;
  if (!scene.account.guest) {
    const a = await browser.newContext({ viewport: VP });
    const ap = await a.newPage();
    await login(ap, scene.account.email, scene.account.password);
    storageState = await a.storageState();
    await a.close();
  }
  const ctx = await browser.newContext({
    viewport: VP, storageState,
    timezoneId: 'Asia/Kolkata', locale: 'en-IN',
    recordVideo: { dir: outDir, size: VP },
  });
  const page = await ctx.newPage();
  let leadSec = 0, tBeats = 0;
  const t0 = Date.now();
  const ready = async (extra = 300) => {
    await page.waitForTimeout(extra);
    leadSec = (Date.now() - t0) / 1000;
    await installCursor(page);
    tBeats = Date.now();
    return async (s) => { const e = (Date.now() - tBeats) / 1000; if (e < s) await page.waitForTimeout((s - e) * 1000); };
  };
  const at = (phrase, fb, off = 0) => {
    const g = localFind(phrase);
    const local = g == null ? fb : g - slotStart;
    return Math.max(0, local) + off;
  };
  const D = slotDuration + tailT; // tail overlaps the crossfade into the next scene
  try { await scene.beats({ page, at, D, ready }); }
  catch (e) {
    console.log(`[${scene.name}] beats error: ${e.message.split('\n')[0]}`);
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
    throw e; // ruined take — the harness retries the whole scene
  }
  await ctx.close();
  await browser.close();

  const webm = await page.video().path();
  const mp4 = join(outDir, `${scene.name}-v.mp4`);
  V.webmToMp4(webm, mp4, leadSec, D);
  console.log(`[${scene.name}] video ${D.toFixed(2)}s (lead ${leadSec.toFixed(2)})`);
  return mp4;
}
