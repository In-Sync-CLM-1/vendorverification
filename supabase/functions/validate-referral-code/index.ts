import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { referral_code } = await req.json();

    if (!referral_code || typeof referral_code !== "string" || referral_code.length > 20) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("staff_referral_codes")
      .select("referral_code, tenant_id, user_id")
      .eq("referral_code", referral_code)
      .eq("is_active", true)
      .maybeSingle();

    let tenantId: string | null = data?.tenant_id ?? null;
    if (!tenantId && data?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", data.user_id)
        .maybeSingle();
      tenantId = profile?.tenant_id ?? null;
    }

    return new Response(
      JSON.stringify({ valid: !!data && !error, tenant_id: tenantId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
