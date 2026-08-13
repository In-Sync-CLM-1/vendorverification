/**
 * Replicates RMPL OPM project owners into Vendor-Sync as staff accounts.
 *
 * Every project in RMPL must be able to accept a PI, and a PI can only be
 * routed to someone who has an account here. Owners are therefore mirrored
 * across: same email, same password as their RMPL OPM login (the stored hash is
 * copied, never a plaintext password), so nobody has to be told anything or
 * reset anything.
 *
 * Deliberately creates NO role. Approving a PI is gated on being the named
 * project owner, not on a role, so an owner needs nothing beyond an active
 * profile — and withholding roles keeps them out of vendor empanelment
 * approvals, which are a different job.
 *
 * Idempotent: an owner who already has an active profile here is skipped, so
 * this can be re-run whenever RMPL adds project owners.
 *
 *   node scripts/sync-rmpl-project-owners.mjs          # report only
 *   node scripts/sync-rmpl-project-owners.mjs --apply  # create the accounts
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const vendorEnv = readEnv(path.join(process.cwd(), ".env"));
const rmplEnv = readEnv(path.join(process.env.USERPROFILE || process.env.HOME, "rmpl", ".env"));

// The tenant these owners belong to — RMPL/Redefine Marcom.
const TENANT_ID = "467ce2a0-5df8-40a7-81d6-ccdc77b66ce9";
// Kept in step with list-rmpl-projects: projects in execution, plus the
// standing internal-billing project.
const ALWAYS_INCLUDED_PROJECT_NUMBERS = ["RMPL-26-999"];

async function sql(ref, token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "curl/8",
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SQL failed: ${JSON.stringify(body)}`);
  return body;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  const rmplRef = rmplEnv.VITE_SUPABASE_PROJECT_ID;
  const rmplToken = rmplEnv.SUPABASE_ACCESS_TOKEN;
  const vendorRef = vendorEnv.VITE_SUPABASE_PROJECT_ID;
  const vendorToken = vendorEnv.SUPABASE_ACCESS_TOKEN;
  const vendorUrl = vendorEnv.VITE_SUPABASE_URL;
  const serviceKey = vendorEnv.SUPABASE_SERVICE_ROLE_KEY;

  const numbers = ALWAYS_INCLUDED_PROJECT_NUMBERS.map(lit).join(",");
  const owners = await sql(
    rmplRef,
    rmplToken,
    `SELECT DISTINCT pr.email, pr.full_name, u.encrypted_password, count(*) OVER (PARTITION BY pr.email) AS projects
       FROM public.projects p
       JOIN public.profiles pr ON pr.id = p.project_owner
       JOIN auth.users u ON lower(u.email) = lower(pr.email)
      WHERE (p.status = 'execution' OR p.project_number IN (${numbers}))
        AND pr.email IS NOT NULL
      ORDER BY pr.email;`
  );

  const emails = owners.map((o) => lit(o.email.toLowerCase())).join(",");
  const existing = await sql(
    vendorRef,
    vendorToken,
    `SELECT lower(public.decrypt_pii(email_encrypted)) AS email, is_active
       FROM public.profiles
      WHERE lower(public.decrypt_pii(email_encrypted)) IN (${emails});`
  );
  const have = new Map(existing.map((r) => [r.email, r.is_active]));

  // An owner may already have a login here whose profile is unusable — wrong
  // tenant, switched off, or an address destroyed by the old PII-masking fault
  // (which is why the decrypted-email check above misses them). Those are
  // repaired in place; creating a second account for the same person would
  // leave two of them.
  const authRows = await sql(
    vendorRef,
    vendorToken,
    `SELECT lower(u.email) AS email, u.id AS user_id, p.id AS profile_id
       FROM auth.users u
       LEFT JOIN public.profiles p ON p.user_id = u.id
      WHERE lower(u.email) IN (${emails});`
  );
  const authByEmail = new Map(authRows.map((r) => [r.email, r]));

  const pending = owners.filter((o) => !have.has(o.email.toLowerCase()));
  const toRepair = pending.filter((o) => authByEmail.has(o.email.toLowerCase()));
  const todo = pending.filter((o) => !authByEmail.has(o.email.toLowerCase()));

  console.log(`RMPL project owners: ${owners.length}`);
  console.log(`already usable in Vendor-Sync: ${owners.length - pending.length}`);
  console.log(`to create: ${todo.length}`);
  for (const o of todo) console.log(`  - ${o.full_name} <${o.email}>`);
  if (toRepair.length) {
    console.log(`to repair (login exists, profile unusable): ${toRepair.length}`);
    for (const o of toRepair) console.log(`  - ${o.full_name} <${o.email}>`);
  }

  if (!APPLY) {
    console.log("\nreport only — re-run with --apply to create these accounts");
    return;
  }

  for (const o of todo) {
    const email = o.email.toLowerCase();
    // Create through the Admin API so the identity row and token columns are
    // built correctly, then swap in the RMPL password hash.
    const res = await fetch(`${vendorUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
      }),
    });
    const created = await res.json();
    if (!res.ok) {
      console.error(`  FAILED ${email}: ${created.msg || created.error_description || JSON.stringify(created)}`);
      continue;
    }

    await sql(
      vendorRef,
      vendorToken,
      `UPDATE auth.users SET encrypted_password = ${lit(o.encrypted_password)}
        WHERE id = ${lit(created.id)};
       INSERT INTO public.profiles (user_id, tenant_id, full_name, email, is_active)
       VALUES (${lit(created.id)}, ${lit(TENANT_ID)}, ${lit(o.full_name)}, ${lit(email)}, true);`
    );
    console.log(`  created ${o.full_name} <${email}>`);
  }

  for (const o of toRepair) {
    const email = o.email.toLowerCase();
    const row = authByEmail.get(email);
    // Re-setting profiles.email lets the PII trigger re-encrypt a real address
    // over the masked one.
    const profileSql = row.profile_id
      ? `UPDATE public.profiles
            SET tenant_id = ${lit(TENANT_ID)}, full_name = ${lit(o.full_name)},
                email = ${lit(email)}, is_active = true
          WHERE id = ${lit(row.profile_id)};`
      : `INSERT INTO public.profiles (user_id, tenant_id, full_name, email, is_active)
         VALUES (${lit(row.user_id)}, ${lit(TENANT_ID)}, ${lit(o.full_name)}, ${lit(email)}, true);`;

    await sql(
      vendorRef,
      vendorToken,
      `UPDATE auth.users SET encrypted_password = ${lit(o.encrypted_password)}
        WHERE id = ${lit(row.user_id)};
       ${profileSql}`
    );
    console.log(`  repaired ${o.full_name} <${email}>`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
