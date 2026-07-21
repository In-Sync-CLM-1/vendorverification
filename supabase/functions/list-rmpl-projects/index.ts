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

// Reads the RMPL (In-Sync RMPL OPM) project list — a separate Supabase
// project — filtered to projects currently in execution. RMPL owns the
// project master data; this app only ever reads it, to let staff tag a
// vendor advance request against the right client project.
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
    if (!isStaff) {
      return jsonResponse({ error: "Only staff can view the project list" }, 403);
    }

    const params = new URLSearchParams({
      select: "id,project_name",
      status: "eq.execution",
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

    const projects = await rmplRes.json();
    return jsonResponse({ projects });
  } catch (error) {
    console.error("list-rmpl-projects failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
