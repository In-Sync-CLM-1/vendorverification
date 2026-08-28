/**
 * Manually fires the same sync the cron-worker runs daily
 * (supabase/functions/sync-rmpl-livecom-csbd) — for testing, or to apply an
 * RMPL Livecom/CSBD change immediately instead of waiting for the next
 * scheduled run. Contains no sync logic of its own; it only calls the
 * deployed function, so there's nothing here that can drift from what the
 * worker actually runs.
 *
 *   node scripts/trigger-rmpl-livecom-csbd-sync.mjs
 */
import fs from "node:fs";
import path from "node:path";

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = readEnv(path.join(process.cwd(), ".env"));

const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/sync-rmpl-livecom-csbd`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
  body: "{}",
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
if (!res.ok || body.error) process.exit(1);
