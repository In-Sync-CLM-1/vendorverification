import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier, identifierType, tenant_id, purpose } = await req.json();

    if (!identifier || !identifierType) {
      return new Response(
        JSON.stringify({ error: "identifier and identifierType are required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["phone", "email"].includes(identifierType)) {
      return new Response(
        JSON.stringify({ error: "identifierType must be 'phone' or 'email'" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate identifier format
    if (identifierType === "phone") {
      const clean = identifier.replace(/\D/g, "");
      if (clean.length !== 10 || !/^[6-9]/.test(clean)) {
        return new Response(
          JSON.stringify({ error: "Invalid 10-digit Indian mobile number" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        return new Response(
          JSON.stringify({ error: "Invalid email address" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Normalize identifier for storage
    const normalizedIdentifier = identifierType === "phone"
      ? `+91${identifier.replace(/\D/g, "")}`
      : identifier.toLowerCase().trim();

    // Vendor portal logins are only for approved vendors registered with this
    // exact email / WhatsApp number
    if (purpose === "vendor_portal") {
      const { data: match, error: matchError } = await supabase.rpc("find_vendor_by_contact", {
        p_identifier: normalizedIdentifier,
      });
      const vendor = Array.isArray(match) ? match[0] : match;
      if (matchError) console.error("find_vendor_by_contact error:", matchError);
      if (!vendor || vendor.current_status !== "approved") {
        return new Response(
          JSON.stringify({
            error: identifierType === "phone"
              ? "No approved vendor is registered with this WhatsApp number."
              : "No approved vendor is registered with this email address.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Rate limit: max 5 OTPs per identifier per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("public_otp_verifications")
      .select("*", { count: "exact", head: true })
      .eq("identifier", normalizedIdentifier)
      .gte("created_at", oneHourAgo);

    if (countError) {
      console.error("Rate limit check error:", countError);
    } else if ((count || 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many OTP requests. Please try again later." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate OTP and store
    const otpCode = generateOtp();

    // Invalidate any previous unverified OTPs for this identifier so vendors
    // who request multiple codes can only use the latest one.
    await supabase
      .from("public_otp_verifications")
      .update({ expires_at: new Date().toISOString() })
      .eq("identifier", normalizedIdentifier)
      .is("verified_at", null);

    // tenant_id is optional (NULL for org-registration OTPs — no tenant exists yet).
    // Removed the "fall back to first tenant in DB" default which silently mis-attributed
    // OTPs from new tenants to whichever tenant happened to be first.
    const resolvedTenantId = tenant_id || null;

    const { data: otpRecord, error: insertError } = await supabase
      .from("public_otp_verifications")
      .insert({
        identifier: normalizedIdentifier,
        identifier_type: identifierType,
        otp_code: otpCode,
        tenant_id: resolvedTenantId,
      })
      .select("session_id")
      .single();

    if (insertError || !otpRecord) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionId = otpRecord.session_id;

    // ===== PHONE PATH: WhatsApp via Exotel =====
    if (identifierType === "phone") {
      // Read WhatsApp config from database
      const { data: wsConfig } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!wsConfig?.exotel_sid || !wsConfig?.exotel_api_key || !wsConfig?.exotel_api_token || !wsConfig?.whatsapp_source_number) {
        // Test mode - WhatsApp not configured
        console.log("WhatsApp not configured - returning test mode OTP:", otpCode);
        return new Response(
          JSON.stringify({
            success: true,
            sessionId,
            message: "WhatsApp not configured - Test Mode",
            isTestMode: true,
            testOtp: otpCode,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const toPhone = normalizedIdentifier.replace("+", "");
      const fromNumber = wsConfig.whatsapp_source_number.replace("+", "");
      const subdomain = wsConfig.exotel_subdomain || "api.exotel.com";

      const payload = {
        custom_data: toPhone,
        whatsapp: {
          messages: [
            {
              from: fromNumber,
              to: toPhone,
              content: {
                type: "template",
                template: {
                  name: "vendorverification_otp_v1",
                  language: { code: "en" },
                  components: [
                    {
                      type: "body",
                      parameters: [{ type: "text", text: otpCode }],
                    },
                    {
                      type: "button",
                      sub_type: "url",
                      index: "0",
                      parameters: [{ type: "text", text: otpCode }],
                    },
                  ],
                },
              },
            },
          ],
        },
      };

      const exotelUrl = `https://${wsConfig.exotel_api_key}:${wsConfig.exotel_api_token}@${subdomain}/v2/accounts/${wsConfig.exotel_sid}/messages`;

      const exotelResponse = await fetch(exotelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Exotel WA messaging: 202 = accepted/queued; 200 = silent failure (bad template, wrong creds, etc.)
      if (exotelResponse.status !== 202) {
        const errorText = await exotelResponse.text();
        console.error("Exotel API error:", exotelResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to send WhatsApp message" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.info(`OTP sent successfully via WhatsApp to ${normalizedIdentifier}`);
      return new Response(
        JSON.stringify({ success: true, sessionId, message: "OTP sent to your WhatsApp" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== EMAIL PATH: Resend API =====
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background-color: #f4f4f5;">
        <div style="background-color: #ffffff; border-radius: 12px; padding: 40px 32px; text-align: center; border: 1px solid #e4e4e7;">
          <h2 style="color: #111827; margin: 0 0 8px 0; font-size: 22px; font-weight: 700;">Vendor-Sync</h2>
          <p style="color: #6b7280; margin: 0 0 28px 0; font-size: 14px;">${purpose === "org_registration" ? "Organization Registration" : purpose === "vendor_portal" ? "Vendor Portal Login" : "Vendor Registration Verification"}</p>
          <p style="color: #374151; margin: 0 0 16px 0; font-size: 14px;">Your verification code is:</p>
          <div style="border: 2px solid #d1d5db; border-radius: 10px; padding: 18px; margin: 0 0 24px 0; background-color: #f9fafb;">
            <span style="color: #000000; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: monospace;">${otpCode}</span>
          </div>
          <p style="color: #6b7280; margin: 0; font-size: 12px;">This code expires in 5 minutes. Do not share it with anyone.</p>
        </div>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Vendor-Sync <noreply@in-sync.co.in>",
        to: [normalizedIdentifier],
        subject: purpose === "org_registration" ? "Your verification code for Vendor-Sync" : purpose === "vendor_portal" ? "Your login code for Vendor-Sync" : "Your OTP for Vendor Registration",
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", resendResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.info(`OTP sent successfully via Email to ${normalizedIdentifier}`);
    return new Response(
      JSON.stringify({ success: true, sessionId, message: "OTP sent to your email" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-public-otp:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
