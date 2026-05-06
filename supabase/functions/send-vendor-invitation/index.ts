import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidIndianPhone(phone: string): boolean {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
}

function sanitizeString(value: string, maxLength: number): string {
  return value.trim().substring(0, maxLength);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Authenticate staff user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify staff
    const { data: isStaff } = await supabaseAdmin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the staff user's tenant — required by NOT NULL constraint on vendor_invitations.tenant_id
    const { data: tenantId, error: tenantErr } = await supabaseAdmin.rpc("get_user_tenant_id", { _user_id: user.id });
    if (tenantErr || !tenantId) {
      console.error("Tenant lookup failed");
      return new Response(JSON.stringify({ error: "Tenant not found for user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { company_name, contact_email, contact_phone, category_id } = body;

    // Validate required fields
    if (!company_name || !contact_email || !contact_phone || !category_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate email format
    if (!isValidEmail(contact_email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate phone format
    if (!isValidIndianPhone(contact_phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate string lengths
    if (company_name.length > 255) {
      return new Response(JSON.stringify({ error: "Company name too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get staff referral code for the registration link
    const { data: refCode } = await supabaseAdmin
      .from("staff_referral_codes")
      .select("referral_code")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const token = crypto.randomUUID();
    const registrationPath = refCode?.referral_code
      ? `/register/ref/${refCode.referral_code}`
      : `/register/ref/${token}`;

    // Insert invitation
    const { data: invitation, error: insertError } = await supabaseAdmin
      .from("vendor_invitations")
      .insert({
        tenant_id: tenantId,
        company_name: sanitizeString(company_name, 255),
        contact_email,
        contact_phone,
        category_id,
        token,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Invitation creation failed");
      return new Response(JSON.stringify({ error: "Failed to create invitation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const registrationUrl = `https://vendorverification.in-sync.co.in${registrationPath}`;

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Vendor Verification Portal <noreply@in-sync.co.in>",
        to: [contact_email],
        subject: `Vendor Registration Invitation`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066B3;">
              <h1 style="color: #0066B3; margin: 0;">Vendor Verification Portal</h1>
              <p style="color: #666; margin: 5px 0 0;">Vendor Onboarding</p>
            </div>
            <div style="padding: 30px 0;">
              <p>Dear <strong>${sanitizeString(company_name, 100)}</strong>,</p>
              <p>You have been invited to register as a vendor. Please click the button below to complete your registration.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${registrationUrl}" style="background-color: #0066B3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Complete Registration
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">This invitation is valid for 7 days. If you did not expect this invitation, please ignore this email.</p>
            </div>
            <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
              <p>Vendor Management Portal</p>
            </div>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("Email send failed");
      // Invitation was created, email failure is not critical
    }

    // Send WhatsApp via Exotel using the `vendor_invitation` template and log
    // every attempt to whatsapp_messages so deliveries are auditable.
    try {
      const { data: wsConfig } = await supabaseAdmin
        .from("whatsapp_settings")
        .select("exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, whatsapp_source_number")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (wsConfig?.exotel_sid && wsConfig?.exotel_api_key && wsConfig?.exotel_api_token && wsConfig?.whatsapp_source_number) {
        const phoneDigits = contact_phone.replace(/\D/g, "");
        const toPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
        const fromNumber = wsConfig.whatsapp_source_number.replace("+", "");
        const subdomain = wsConfig.exotel_subdomain || "api.exotel.com";
        const safeCompany = sanitizeString(company_name, 60);

        const waPayload = {
          custom_data: toPhone,
          whatsapp: {
            messages: [
              {
                from: fromNumber,
                to: toPhone,
                content: {
                  type: "template",
                  template: {
                    name: "vendor_invitation",
                    language: { code: "en" },
                    components: [
                      {
                        type: "body",
                        parameters: [
                          { type: "text", text: safeCompany },
                          { type: "text", text: registrationUrl },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        };

        const waAuth = `Basic ${btoa(`${wsConfig.exotel_api_key}:${wsConfig.exotel_api_token}`)}`;
        const waRes = await fetch(`https://${subdomain}/v2/accounts/${wsConfig.exotel_sid}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: waAuth },
          body: JSON.stringify(waPayload),
        });

        const waText = await waRes.text();
        let exotelMessageId: string | null = null;
        let errorMessage: string | null = null;
        let logStatus: "sent" | "failed" = waRes.ok ? "sent" : "failed";

        try {
          const parsed = JSON.parse(waText);
          // Exotel v2 returns: { response: [{ data: { messages: [{ id }] } }] } on success
          exotelMessageId =
            parsed?.response?.[0]?.data?.messages?.[0]?.id ??
            parsed?.response?.[0]?.data?.id ??
            null;
          if (!waRes.ok) {
            errorMessage =
              parsed?.response?.[0]?.error_data?.description ??
              parsed?.response?.[0]?.error_data?.message ??
              waText.slice(0, 500);
          }
        } catch {
          if (!waRes.ok) errorMessage = waText.slice(0, 500);
        }

        if (!waRes.ok) {
          console.error("WhatsApp send failed:", waRes.status, errorMessage);
        }

        await supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          vendor_id: null,
          phone_number: toPhone,
          direction: "outbound",
          template_name: "vendor_invitation",
          template_variables: { "1": safeCompany, "2": registrationUrl },
          message_content: `Hi ${safeCompany}, you have been invited to register as a vendor on the Vendor Verification Portal.\n\nComplete your registration here: ${registrationUrl}\n\nThis invitation is valid for 7 days.`,
          status: logStatus,
          exotel_message_id: exotelMessageId,
          error_message: errorMessage,
          sent_by: user.id,
          sent_at: logStatus === "sent" ? new Date().toISOString() : null,
        });
      }
    } catch (waErr) {
      console.error("WhatsApp send threw:", waErr);
    }

    return new Response(
      JSON.stringify({ success: true, invitation_id: invitation.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Request processing failed");
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
