import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, otp } = await req.json();

    if (!sessionId || !otp) {
      return new Response(
        JSON.stringify({ error: "sessionId and otp are required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up by session_id where not yet verified
    const { data: otpRecord, error: fetchError } = await supabase
      .from("public_otp_verifications")
      .select("*")
      .eq("session_id", sessionId)
      .is("verified_at", null)
      .single();

    if (fetchError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "No valid OTP found. Please request a new one." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "OTP has expired. Please request a new one." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return new Response(
        JSON.stringify({ error: "Maximum attempts exceeded. Please request a new OTP." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment attempts
    await supabase
      .from("public_otp_verifications")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    // Test mode bypass: accept 123456 for test number
    const isTestNumber = otpRecord.identifier === "+919999999999" && otp === "123456";

    // Compare OTP
    if (otp === otpRecord.otp_code || isTestNumber) {
      // Mark as verified
      await supabase
        .from("public_otp_verifications")
        .update({ verified_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      const identifier = otpRecord.identifier;
      const isPhone = otpRecord.identifier_type === "phone";

      // ── 1. Find or create auth user ──
      // Use a deterministic email so we can generate a magic link session
      const phoneDigits = identifier.replace(/\D/g, "").slice(-10);
      const generatedEmail = isPhone ? `vendor.${phoneDigits}@app.vendor.local` : identifier;

      let authUserId: string | null = null;

      // Try to find existing user by email
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      let existingUser = users?.find((u: any) => u.email === generatedEmail);

      // Also check by phone for phone-based logins
      if (!existingUser && isPhone) {
        existingUser = users?.find((u: any) => u.phone === identifier);
      }

      if (existingUser) {
        authUserId = existingUser.id;
        // Ensure the email is set (for magic link generation)
        if (isPhone && !existingUser.email) {
          await supabase.auth.admin.updateUser(existingUser.id, {
            email: generatedEmail,
            email_confirm: true,
          });
        }
      } else {
        // Create new auth user
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: generatedEmail,
          email_confirm: true,
          ...(isPhone ? { phone: identifier, phone_confirm: true } : {}),
        });
        if (!createErr && newUser?.user) {
          authUserId = newUser.user.id;
        } else {
          console.error("Failed to create auth user:", createErr);
        }
      }

      // ── 2. Link auth user to vendor via vendor_users ──
      if (authUserId) {
        const { data: vendor } = await supabase
          .from("vendors")
          .select("id, tenant_id")
          .or(`primary_mobile.eq.${phoneDigits},primary_mobile.eq.${identifier},primary_email.eq.${identifier}`)
          .limit(1)
          .maybeSingle();

        if (vendor) {
          const { data: existingLink } = await supabase
            .from("vendor_users")
            .select("id")
            .eq("user_id", authUserId)
            .eq("vendor_id", vendor.id)
            .maybeSingle();

          if (!existingLink) {
            await supabase.from("vendor_users").insert({
              user_id: authUserId,
              vendor_id: vendor.id,
              tenant_id: vendor.tenant_id,
            });
          }
        }
      }

      // ── 3. Generate magic link token for client-side session ──
      let tokenHash: string | null = null;
      if (authUserId) {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: generatedEmail,
        });

        if (!linkErr && linkData?.properties?.hashed_token) {
          tokenHash = linkData.properties.hashed_token;
        } else {
          console.error("Failed to generate magic link:", linkErr);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          identifier: otpRecord.identifier,
          identifierType: otpRecord.identifier_type,
          tokenHash,
          email: authUserId ? generatedEmail : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mismatch
    const remaining = otpRecord.max_attempts - (otpRecord.attempts + 1);
    return new Response(
      JSON.stringify({ error: "Invalid OTP", remainingAttempts: remaining }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in verify-public-otp:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
