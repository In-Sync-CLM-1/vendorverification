// Platform-admin operations on a tenant: disable, enable, extend trial.
// Hard-deletes are handled by the separate delete-organization function.
//
// All actions go through SECURITY DEFINER RPCs that re-check platform_admin
// inside the database, so this function only needs to forward the call as
// the authenticated caller (no service-role usage required).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Action = "disable" | "enable" | "extend_trial";

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

    const { action, tenant_id, additional_days } = await req.json() as {
      action: Action;
      tenant_id: string;
      additional_days?: number;
    };

    if (!action || !tenant_id) {
      return new Response(JSON.stringify({ error: "action and tenant_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    if (action === "disable" || action === "enable") {
      const { data, error } = await supabase.rpc("set_organization_active", {
        _tenant_id: tenant_id,
        _active: action === "enable",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, ...data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "extend_trial") {
      if (!additional_days || additional_days < 1 || additional_days > 365) {
        return new Response(JSON.stringify({ error: "additional_days must be between 1 and 365" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase.rpc("extend_organization_trial", {
        _tenant_id: tenant_id,
        _additional_days: additional_days,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, ...data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-organization error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
