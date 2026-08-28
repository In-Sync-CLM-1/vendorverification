import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Keeps RMPL Livecom/CSBD's SSO access into Vendor-Sync's Redefine Marcom
// tenant in step with RMPL, the source of truth — in BOTH directions. This
// replaces the old one-off script (scripts/sync-rmpl-livecom-csbd-viewers.mjs):
// that only ever added access, so someone removed from Livecom/CSBD (or
// deactivated outright) in RMPL kept their Vendor-Sync login indefinitely
// unless a human remembered to re-run it — a standing backdoor. This runs
// on a schedule (cron-worker, daily — see jobs.txt) and does a full diff
// every time: anyone RMPL currently reports as active in Livecom/CSBD gets
// created/reactivated + the right roles; anyone this sync previously
// provisioned who has since dropped off that list (left the department,
// or been deactivated in RMPL) gets fully deactivated here too, not just
// stripped of a role — many staff SELECT policies in this app only check
// "is this an active profile in the tenant" (is_internal_staff), not a
// specific role, so is_active=false is the only floor that actually closes
// off read access as well as writes.
//
// "Owned by this sync" is tracked via profiles.department: every account
// this function creates or touches gets its RMPL department string written
// there (e.g. "Livecom", "CSBD Team"), and the revoke pass only ever
// touches active Redefine Marcom profiles whose department still matches
// livecom/csbd — it never deactivates an account it didn't provision.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENANT_ID = "467ce2a0-5df8-40a7-81d6-ccdc77b66ce9"; // Redefine Marcom

interface RmplEmployee {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  department: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rmplApiUrl = Deno.env.get("RMPL_PUBLIC_API_URL");
    const rmplApiKey = Deno.env.get("RMPL_API_KEY");
    if (!rmplApiUrl || !rmplApiKey) {
      return json({ error: "RMPL_PUBLIC_API_URL / RMPL_API_KEY not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const rmplRes = await fetch(rmplApiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${rmplApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_employees" }),
    });
    if (!rmplRes.ok) {
      const text = await rmplRes.text().catch(() => "");
      return json({ error: `RMPL fetch failed: ${rmplRes.status} ${text}` }, 502);
    }
    const rmplJson = await rmplRes.json();
    const allEmployees: RmplEmployee[] = rmplJson.data ?? [];

    const target = allEmployees
      .filter((e) => e.department && /(livecom|csbd)/i.test(e.department) && e.email)
      .map((e) => ({ ...e, email: e.email.toLowerCase(), isLivecom: /livecom/i.test(e.department!) }));
    const targetByEmail = new Map(target.map((e) => [e.email, e]));

    // Every Vendor-Sync profile this sync could plausibly own: any active
    // Redefine Marcom profile whose department already reads Livecom/CSBD
    // (from a prior run), plus anyone matching today's target list by email.
    const { data: existingRows, error: existingErr } = await admin
      .from("profiles")
      .select("id, user_id, department, is_active")
      .eq("tenant_id", TENANT_ID);
    if (existingErr) throw existingErr;

    const { data: authUsersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authEmailById = new Map((authUsersPage?.users ?? []).map((u) => [u.id, (u.email || "").toLowerCase()]));

    // profiles.email is masked after the PII trigger runs ("name@***"); the
    // real, reliable identity is auth.users.email — match on that.
    const existingByEmail = new Map(
      (existingRows ?? [])
        .map((r) => ({ ...r, realEmail: authEmailById.get(r.user_id) || "" }))
        .filter((r) => r.realEmail)
        .map((r) => [r.realEmail, r])
    );

    const created: string[] = [];
    const reactivated: string[] = [];
    const roleUpdates: string[] = [];
    const deactivated: string[] = [];
    const errors: { email: string; error: string }[] = [];

    for (const emp of target) {
      try {
        const row = existingByEmail.get(emp.email);
        let userId: string;

        if (!row) {
          const { data: userData, error: createErr } = await admin.auth.admin.createUser({
            email: emp.email,
            password: randomPassword(),
            email_confirm: true,
          });
          userId = userData?.user?.id || "";
          if (createErr || !userId) {
            if (createErr?.message?.toLowerCase().includes("already been registered")) {
              const found = (authUsersPage?.users ?? []).find((u) => (u.email || "").toLowerCase() === emp.email);
              userId = found?.id || "";
            }
            if (!userId) throw new Error(createErr?.message || "createUser failed");
          }

          const { error: insertErr } = await admin
            .from("profiles")
            .insert({
              user_id: userId,
              tenant_id: TENANT_ID,
              full_name: emp.full_name || emp.email,
              email: emp.email,
              phone: emp.phone || null,
              department: emp.department,
              is_active: true,
            });
          if (insertErr) throw insertErr;

          created.push(emp.email);
        } else {
          userId = row.user_id;
          const patch: Record<string, unknown> = {};
          if (!row.is_active) {
            patch.is_active = true;
            reactivated.push(emp.email);
          }
          if (row.department !== emp.department) patch.department = emp.department;
          if (Object.keys(patch).length > 0) {
            const { error: updateErr } = await admin.from("profiles").update(patch).eq("id", row.id);
            if (updateErr) throw updateErr;
          }
        }

        const { data: roleRows } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .in("role", ["viewer", "livecom_uploader"]);
        const hasViewer = (roleRows ?? []).some((r) => r.role === "viewer");
        const hasUploader = (roleRows ?? []).some((r) => r.role === "livecom_uploader");

        if (!hasViewer) {
          await admin.from("user_roles").insert({ user_id: userId, tenant_id: TENANT_ID, role: "viewer" });
          roleUpdates.push(`${emp.email}: +viewer`);
        }
        if (emp.isLivecom && !hasUploader) {
          await admin.from("user_roles").insert({ user_id: userId, tenant_id: TENANT_ID, role: "livecom_uploader" });
          roleUpdates.push(`${emp.email}: +livecom_uploader`);
        } else if (!emp.isLivecom && hasUploader) {
          // Moved from Livecom to CSBD — the upload right doesn't follow.
          await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "livecom_uploader");
          roleUpdates.push(`${emp.email}: -livecom_uploader (moved to CSBD)`);
        }
      } catch (err) {
        errors.push({ email: emp.email, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Revoke pass: active accounts this sync owns (department already
    // tagged Livecom/CSBD) that are no longer in today's RMPL target list —
    // left the department, or deactivated in RMPL outright.
    for (const [email, row] of existingByEmail) {
      if (!row.is_active) continue;
      if (!row.department || !/(livecom|csbd)/i.test(row.department)) continue;
      if (targetByEmail.has(email)) continue;

      try {
        const { error: deactivateErr } = await admin.from("profiles").update({ is_active: false }).eq("id", row.id);
        if (deactivateErr) throw deactivateErr;
        await admin.from("user_roles").delete().eq("user_id", row.user_id).in("role", ["viewer", "livecom_uploader"]);
        deactivated.push(email);
      } catch (err) {
        errors.push({ email, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return json({
      success: errors.length === 0,
      rmpl_livecom_csbd_active: target.length,
      created,
      reactivated,
      role_updates: roleUpdates,
      deactivated,
      errors,
    });
  } catch (error) {
    console.error("sync-rmpl-livecom-csbd failed:", error);
    return json({ error: error instanceof Error ? error.message : "Sync failed" }, 500);
  }
});
