import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STORAGE_BUCKET = "vendor-documents";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id } = await req.json();
    if (!tenant_id || typeof tenant_id !== "string") {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller-scoped client — used to invoke the SECURITY DEFINER RPC.
    // The RPC itself enforces "must be platform_admin".
    const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service-role client — used for storage cleanup and listing files.
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Authenticate the caller before doing any work.
    const { data: userData, error: userErr } = await supabaseAsCaller.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is a platform admin (defence-in-depth — the RPC checks too).
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(
        JSON.stringify({ error: "Only platform admins can delete organizations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find every storage path that belongs to vendors in this tenant. The
    // bucket layout used by the app puts files under `<vendor_id>/...`, so
    // we list once per vendor folder.
    const { data: vendors } = await supabaseAdmin
      .from("vendors")
      .select("id")
      .eq("tenant_id", tenant_id);

    const filesToRemove: string[] = [];
    for (const v of vendors ?? []) {
      // List up to 1000 files under <vendor_id>/. If a tenant has more than
      // that under a single vendor we'd need to paginate — fine for now.
      const { data: files } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .list(v.id, { limit: 1000 });
      for (const f of files ?? []) {
        filesToRemove.push(`${v.id}/${f.name}`);
      }
    }

    if (filesToRemove.length > 0) {
      const { error: removeErr } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .remove(filesToRemove);
      if (removeErr) {
        console.error("Storage cleanup failed:", removeErr);
        return new Response(
          JSON.stringify({ error: "Failed to remove vendor documents from storage." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Run the atomic DB wipe via the SECURITY DEFINER RPC, called as the
    // platform-admin user so auth.uid() inside the function is theirs.
    const { data: rpcResult, error: rpcErr } = await supabaseAsCaller.rpc(
      "delete_organization",
      { _tenant_id: tenant_id }
    );

    if (rpcErr) {
      console.error("delete_organization RPC failed:", rpcErr);
      return new Response(
        JSON.stringify({ error: rpcErr.message ?? "Database deletion failed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete auth users that no longer belong to any tenant.
    const orphanedUserIds: string[] = (rpcResult as any)?.orphaned_user_ids ?? [];
    for (const uid of orphanedUserIds) {
      const { error: deleteUserErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (deleteUserErr) {
        console.error(`Failed to delete auth user ${uid}:`, deleteUserErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id,
        files_removed: filesToRemove.length,
        users_removed: orphanedUserIds.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-organization error:", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
