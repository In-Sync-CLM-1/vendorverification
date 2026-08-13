/**
 * Submits the `pi_quotation_submitted_v1` WhatsApp template to Meta (via
 * Exotel) and records it in whatsapp_templates.
 *
 * Meta approval is asynchronous — the notify function only sends WhatsApp once
 * whatsapp_templates.status is 'approved', so email works from day one and
 * WhatsApp switches itself on when approval lands. Re-run to re-check status.
 *
 * A template name cannot be reused for ~4 weeks after deletion, so get the
 * wording right rather than deleting and re-submitting under the same name.
 *
 *   node scripts/create-pi-quotation-template.mjs           # status only
 *   node scripts/create-pi-quotation-template.mjs --submit  # create at Meta
 */
import fs from "node:fs";
import path from "node:path";

const SUBMIT = process.argv.includes("--submit");
const TEMPLATE_NAME = "pi_quotation_submitted_v1";
const BODY =
  "Hello {{1}}, {{2}} has submitted a {{3}} of {{4}} for project {{5}} on Vendor-Sync. " +
  "Please review it and record your approval decision.";
const SAMPLE = ["Manoj Mishra", "Prosync AI Solutions", "Proforma Invoice", "Rs 39530", "RMPL-26-999"];

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
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${env.VITE_SUPABASE_PROJECT_ID}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "curl/8",
      },
      body: JSON.stringify({ query }),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const [settings] = await sql(
  `SELECT exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, waba_id, tenant_id
     FROM public.whatsapp_settings WHERE is_active = true LIMIT 1;`
);
if (!settings) throw new Error("no active whatsapp settings");

const sub = settings.exotel_subdomain || "api.exotel.com";
const auth = "Basic " + Buffer.from(`${settings.exotel_api_key}:${settings.exotel_api_token}`).toString("base64");

async function metaStatus() {
  let after = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://${sub}/v2/accounts/${settings.exotel_sid}/templates`);
    url.searchParams.set("waba_id", settings.waba_id);
    url.searchParams.set("limit", "200");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: auth } });
    const j = await res.json();
    const arr = (j?.response?.whatsapp?.templates || []).map((t) => t.data).filter(Boolean);
    const hit = arr.find((t) => t.name === TEMPLATE_NAME);
    if (hit) return hit.status;
    const paging = j?.response?.whatsapp?.paging || j?.paging;
    after = paging?.cursors?.after || null;
    if (!after || arr.length < 200) break;
  }
  return null;
}

const current = await metaStatus();
console.log(`${TEMPLATE_NAME} at Meta: ${current || "not present"}`);

// whatsapp_templates has no unique key on template_name, so upsert by hand.
async function record(status) {
  await sql(
    `UPDATE public.whatsapp_templates SET status = ${lit(status)}
      WHERE template_name = ${lit(TEMPLATE_NAME)};
     INSERT INTO public.whatsapp_templates (tenant_id, template_name, status, content)
     SELECT ${lit(settings.tenant_id)}, ${lit(TEMPLATE_NAME)}, ${lit(status)}, ${lit(BODY)}
      WHERE NOT EXISTS (
        SELECT 1 FROM public.whatsapp_templates WHERE template_name = ${lit(TEMPLATE_NAME)}
      );`
  );
}

if (current) {
  await record(current.toLowerCase());
  console.log(`recorded locally as ${current.toLowerCase()}`);
  process.exit(0);
}

if (!SUBMIT) {
  console.log("not submitted — re-run with --submit to create it at Meta");
  process.exit(0);
}

const payload = {
  whatsapp: {
    templates: [
      {
        template: {
          name: TEMPLATE_NAME,
          language: "en",
          category: "UTILITY",
          components: [
            { type: "BODY", text: BODY, example: { body_text: [SAMPLE] } },
          ],
        },
      },
    ],
  },
};

const res = await fetch(
  `https://${sub}/v2/accounts/${settings.exotel_sid}/templates?waba_id=${settings.waba_id}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(payload),
  }
);
const text = await res.text();
console.log("HTTP", res.status);

let accepted = false;
try {
  const j = JSON.parse(text);
  const entry = j?.response?.whatsapp?.templates?.[0];
  accepted = res.ok && (entry?.code === 200 || entry?.code === 201 || entry?.status === "success");
  if (!accepted) console.log(JSON.stringify(entry ?? j).slice(0, 800));
} catch {
  console.log(text.slice(0, 800));
}

if (accepted) {
  await record("pending");
  console.log("submitted to Meta — re-run this script later to pick up approval");
}
