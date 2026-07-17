import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify staff
    const { data: isStaff } = await supabaseAdmin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve caller's tenant — used to scope recipient lookups so a staff user
    // cannot trigger notifications for users in other tenants.
    const { data: callerTenantId } = await supabaseAdmin.rpc("get_user_tenant_id", { _user_id: user.id });
    if (!callerTenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found for caller" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipient_id, title, message, notification_type } = await req.json();

    if (!recipient_id || !title || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up recipient email from auth.users
    const { data: recipientUser, error: recipientError } = await supabaseAdmin.auth.admin.getUserById(recipient_id);
    if (recipientError || !recipientUser?.user?.email) {
      return new Response(JSON.stringify({ error: "Recipient email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientEmail = recipientUser.user.email;

    // Look up recipient name from profiles or vendor_users — both scoped to caller's tenant.
    let recipientName = "Vendor";
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", recipient_id)
      .eq("tenant_id", callerTenantId)
      .maybeSingle();

    if (profile?.full_name) {
      recipientName = profile.full_name;
    } else {
      // Try vendor table
      const { data: vendorUser } = await supabaseAdmin
        .from("vendor_users")
        .select("vendor_id")
        .eq("user_id", recipient_id)
        .eq("tenant_id", callerTenantId)
        .maybeSingle();

      if (!vendorUser?.vendor_id) {
        return new Response(JSON.stringify({ error: "Recipient is not part of this organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: vendor } = await supabaseAdmin
        .from("vendors")
        .select("primary_contact_name, company_name")
        .eq("id", vendorUser.vendor_id)
        .eq("tenant_id", callerTenantId)
        .maybeSingle();

      if (vendor) {
        recipientName = vendor.primary_contact_name || vendor.company_name || "Vendor";
      }
    }

    // Determine email subject and accent color based on notification type
    let subjectPrefix = "Notification";
    let accentColor = "#0066B3";
    if (notification_type === "approval") {
      subjectPrefix = "Approved";
      accentColor = "#16a34a";
    } else if (notification_type === "rejection") {
      subjectPrefix = "Action Required";
      accentColor = "#dc2626";
    } else if (notification_type === "sent_back") {
      subjectPrefix = "Corrections Required";
      accentColor = "#ea580c";
    }

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Vendor-Sync <noreply@in-sync.co.in>",
        to: [recipientEmail],
        subject: `${subjectPrefix}: ${title} - In-Sync`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid ${accentColor};">
              <h1 style="color: #0066B3; margin: 0;">In-Sync</h1>
              <p style="color: #666; margin: 5px 0 0;">Vendor-Sync</p>
            </div>
            <div style="padding: 30px 0;">
              <p>Dear <strong>${recipientName}</strong>,</p>
              <div style="background-color: #f8f9fa; border-left: 4px solid ${accentColor}; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; color: ${accentColor};">${title}</h3>
                <p style="margin: 0; color: #333;">${message}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://vendor.in-sync.co.in" style="background-color: ${accentColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Open Portal
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If you have any questions, please contact your account manager or write to us.</p>
            </div>
            <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
              <p>In-Sync</p>
              <p>This is an automated notification. Please do not reply to this email.</p>
            </div>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Email send failed:", errBody);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, email: recipientEmail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Request processing failed:", err);
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
