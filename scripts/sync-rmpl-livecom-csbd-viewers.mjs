/**
 * Gives RMPL's Livecom and CSBD teams view-only SSO access to Vendor-Sync's
 * Redefine Marcom org, via the existing RMPL dashboard launcher (same
 * mechanism as Work-Sync's fleet SSO — the launcher only shows a button for
 * someone who already has an account here, so that account is what this
 * script creates).
 *
 * Source of truth is RMPL's designations table (department is free text
 * there, matched case-insensitively against "Livecom"/"CSBD"), joined
 * through user_designations to active RMPL profiles.
 *
 * Every account gets the 'viewer' role — no maker/checker/approver/admin/
 * accounts — so they can see their tenant's data but the RLS-level
 * view-only guards (see migration 20260826140100_view_only_write_guards.sql)
 * block every write regardless of what the UI does. A random password is
 * set since these accounts are only ever reached via the RMPL launcher's
 * magic link, never a direct password login.
 *
 * Livecom specifically (not CSBD) also gets 'livecom_uploader' — a narrow,
 * separate grant that lets them upload an invoice on a vendor's behalf
 * without lifting the view-only floor for anything else (see
 * 20260828150100_livecom_invoice_upload.sql).
 *
 * Idempotent: an active vendor account already present for the email is
 * left alone (just gets whichever roles it's missing); nothing is ever
 * removed or demoted.
 *
 *   node scripts/sync-rmpl-livecom-csbd-viewers.mjs          # report only
 *   node scripts/sync-rmpl-livecom-csbd-viewers.mjs --apply  # create + role
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

// Redefine Marcom's tenant in Vendor-Sync.
const TENANT_ID = "467ce2a0-5df8-40a7-81d6-ccdc77b66ce9";

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

  const rows = await sql(
    rmplRef,
    rmplToken,
    `SELECT DISTINCT ON (p.email) p.email, p.full_name, p.phone,
            (d.department ~* 'livecom') AS is_livecom
       FROM public.user_designations ud
       JOIN public.designations d ON d.id = ud.designation_id
       JOIN public.profiles p ON p.id = ud.user_id
      WHERE d.department ~* '(livecom|csbd)'
        AND p.is_active = true
        AND p.email IS NOT NULL
      ORDER BY p.email;`
  );
  const livecomEmails = new Set(rows.filter((o) => o.is_livecom).map((o) => o.email.toLowerCase()));

  // Matched via auth.users.email, not profiles.email_encrypted — a prior
  // batch (2026-08-13) stored a masked placeholder ("name@***") as the
  // plaintext into profiles.email instead of the real address, so it
  // re-encrypted garbage; auth.users.email is the real, reliable identity.
  const emails = rows.map((o) => lit(o.email.toLowerCase())).join(",");
  const existing = await sql(
    vendorRef,
    vendorToken,
    `SELECT pr.id AS profile_id, pr.user_id, lower(u.email) AS email,
            public.decrypt_pii(pr.email_encrypted) AS stored_email
       FROM auth.users u
       JOIN public.profiles pr ON pr.user_id = u.id
      WHERE lower(u.email) IN (${emails});`
  );
  const have = new Map(existing.map((r) => [r.email, r]));

  const toCreate = rows.filter((o) => !have.has(o.email.toLowerCase()));
  const toRoleOnly = rows.filter((o) => have.has(o.email.toLowerCase()));
  const toRepairEmail = toRoleOnly.filter((o) => {
    const row = have.get(o.email.toLowerCase());
    return row.stored_email && row.stored_email.includes("@***");
  });

  console.log(`RMPL Livecom/CSBD, active: ${rows.length}`);
  console.log(`already have a Vendor-Sync account: ${toRoleOnly.length}`);
  if (toRepairEmail.length) console.log(`  of which have a masked-placeholder email on file: ${toRepairEmail.length}`);
  console.log(`to create: ${toCreate.length}`);
  for (const o of toCreate) console.log(`  - ${o.full_name} <${o.email}>`);

  if (!APPLY) {
    console.log("\nreport only — re-run with --apply to create accounts + grant the viewer role");
    return;
  }

  const newProfileIds = [];

  for (const o of toCreate) {
    const email = o.email.toLowerCase();
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

    const inserted = await sql(
      vendorRef,
      vendorToken,
      `INSERT INTO public.profiles (user_id, tenant_id, full_name, email, phone, is_active)
       VALUES (${lit(created.id)}, ${lit(TENANT_ID)}, ${lit(o.full_name)}, ${lit(email)}, ${o.phone ? lit(o.phone) : "NULL"}, true)
       RETURNING id;`
    );
    newProfileIds.push({ user_id: created.id, name: o.full_name, email });
    console.log(`  created ${o.full_name} <${email}>`);
  }

  for (const o of toRepairEmail) {
    const row = have.get(o.email.toLowerCase());
    await sql(
      vendorRef,
      vendorToken,
      `UPDATE public.profiles
          SET email = ${lit(o.email.toLowerCase())}, phone = COALESCE(phone, ${o.phone ? lit(o.phone) : "NULL"})
        WHERE id = ${lit(row.profile_id)};`
    );
    console.log(`  repaired masked email for ${o.full_name}`);
  }

  const allAccounts = [
    ...newProfileIds.map((p) => ({ user_id: p.user_id, email: p.email })),
    ...toRoleOnly.map((o) => ({ user_id: have.get(o.email.toLowerCase()).user_id, email: o.email.toLowerCase() })),
  ];

  let livecomUploaderCount = 0;
  for (const { user_id: uid, email } of allAccounts) {
    await sql(
      vendorRef,
      vendorToken,
      `INSERT INTO public.user_roles (user_id, tenant_id, role)
       SELECT ${lit(uid)}, ${lit(TENANT_ID)}, 'viewer'::public.app_role
       WHERE NOT EXISTS (
         SELECT 1 FROM public.user_roles WHERE user_id = ${lit(uid)} AND role = 'viewer'::public.app_role
       );`
    );

    if (livecomEmails.has(email.toLowerCase())) {
      await sql(
        vendorRef,
        vendorToken,
        `INSERT INTO public.user_roles (user_id, tenant_id, role)
         SELECT ${lit(uid)}, ${lit(TENANT_ID)}, 'livecom_uploader'::public.app_role
         WHERE NOT EXISTS (
           SELECT 1 FROM public.user_roles WHERE user_id = ${lit(uid)} AND role = 'livecom_uploader'::public.app_role
         );`
      );
      livecomUploaderCount++;
    }
  }
  console.log(`\nviewer role ensured for ${allAccounts.length} accounts (${newProfileIds.length} new, ${toRoleOnly.length} pre-existing).`);
  console.log(`livecom_uploader role ensured for ${livecomUploaderCount} Livecom accounts (CSBD left at view-only).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
