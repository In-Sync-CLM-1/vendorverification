import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RmplProjectRow {
  id: string;
  project_name: string;
  project_number: string | null;
  project_owner: string | null;
}

interface RmplProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

// Reads the RMPL (In-Sync RMPL OPM) project list — a separate Supabase
// project — filtered to projects currently in execution. RMPL owns the
// project master data; this app only ever reads it.
//
// Also resolves each project's owner (RMPL's own profiles.id/full_name/
// email) and matches that owner's email into THIS app's own profiles, so a
// vendor's PI/Quotation submission (or a staff member tagging an advance
// request) can be routed to the right Project Owner without a manual
// picker. Unlike this app's own `profiles`, whose `id` is a separate
// generated key, the match result stored as `project_owner_user_id` is the
// local person's *auth* user id (profiles.user_id) — that's what RLS
// policies compare against auth.uid().
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rmplUrl = Deno.env.get("RMPL_URL");
    const rmplKey = Deno.env.get("RMPL_SERVICE_ROLE_KEY");
    if (!rmplUrl || !rmplKey) {
      return jsonResponse({ error: "RMPL connection is not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ error: "Not signed in" }, 401);
    }
    const { data: isStaff } = await admin.rpc("is_internal_staff", { _user_id: user.id });
    const { data: isVendor } = await admin.rpc("is_vendor_user", { _user_id: user.id });
    if (!isStaff && !isVendor) {
      return jsonResponse({ error: "Only staff or vendor users can view the project list" }, 403);
    }

    // Projects in execution, plus a small allow-list of standing projects that
    // never reach that status but still get billed against — RMPL-26-999
    // ("RMPL Internal") is the catch-all every internal billing is raised on.
    const ALWAYS_INCLUDED_PROJECT_NUMBERS = ["RMPL-26-999"];

    const params = new URLSearchParams({
      select: "id,project_name,project_number,project_owner",
      or: `(status.eq.execution,project_number.in.(${ALWAYS_INCLUDED_PROJECT_NUMBERS.join(",")}))`,
      order: "project_name.asc",
      limit: "200",
    });

    const rmplRes = await fetch(`${rmplUrl}/rest/v1/projects?${params.toString()}`, {
      headers: {
        apikey: rmplKey,
        Authorization: `Bearer ${rmplKey}`,
      },
    });
    if (!rmplRes.ok) {
      console.error("RMPL fetch failed:", rmplRes.status, await rmplRes.text());
      return jsonResponse({ error: "Could not reach RMPL" }, 502);
    }

    const projects = await rmplRes.json() as RmplProjectRow[];

    const ownerIds = [...new Set(projects.map((p) => p.project_owner).filter((id): id is string => !!id))];
    let owners: RmplProfileRow[] = [];
    if (ownerIds.length > 0) {
      const ownerParams = new URLSearchParams({
        select: "id,full_name,email",
        id: `in.(${ownerIds.join(",")})`,
      });
      const ownersRes = await fetch(`${rmplUrl}/rest/v1/profiles?${ownerParams.toString()}`, {
        headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
      });
      if (ownersRes.ok) owners = await ownersRes.json();
    }
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    // Match each project owner's email into this app's own profiles so a
    // PI/Quotation (or advance request) can be routed to that person.
    // profiles.id here is its own generated key, distinct from the auth
    // user id — take profiles.user_id, not profiles.id.
    // Match on the DECRYPTED address via find_staff_by_emails — profiles.email
    // holds a masked value, so comparing against that column matches nobody and
    // every project would come back with no owner.
    const ownerEmails = [...new Set(owners.map((o) => o.email).filter((e): e is string => !!e))];
    let localMatches: { user_id: string; matched_email: string }[] = [];
    if (ownerEmails.length > 0) {
      const { data, error: matchError } = await admin.rpc("find_staff_by_emails", {
        p_emails: ownerEmails,
      });
      if (matchError) console.error("staff email match failed:", matchError.message);
      localMatches = (data ?? []) as { user_id: string; matched_email: string }[];
    }
    const localUserIdByEmail = new Map(
      localMatches.map((m) => [m.matched_email.toLowerCase(), m.user_id])
    );

    const enriched = projects.map((p) => {
      const owner = p.project_owner ? ownerById.get(p.project_owner) : null;
      const ownerEmail = owner?.email ?? null;
      return {
        id: p.id,
        project_name: p.project_name,
        project_number: p.project_number,
        project_owner_external_id: p.project_owner,
        project_owner_name: owner?.full_name ?? null,
        project_owner_email: ownerEmail,
        project_owner_user_id: ownerEmail ? localUserIdByEmail.get(ownerEmail.toLowerCase()) ?? null : null,
      };
    });

    return jsonResponse({ projects: enriched });
  } catch (error) {
    console.error("list-rmpl-projects failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
