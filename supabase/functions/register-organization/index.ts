import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_name, admin_name, admin_email, admin_password, admin_phone, email_session_id, phone_session_id } = await req.json();

    // Validate inputs
    if (!org_name || !admin_name || !admin_email || !admin_password) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (org_name.trim().length < 2 || org_name.trim().length > 100) {
      return new Response(
        JSON.stringify({ error: "Organization name must be 2–100 characters" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidEmail(admin_email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (admin_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phoneDigits = (admin_phone || "").replace(/\D/g, "");
    if (phoneDigits.length !== 10 || !/^[6-9]/.test(phoneDigits)) {
      return new Response(
        JSON.stringify({ error: "Invalid 10-digit Indian mobile number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email_session_id || !phone_session_id) {
      return new Response(
        JSON.stringify({ error: "Email and phone verification are required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const normalizedEmail = admin_email.toLowerCase().trim();
    const normalizedPhone = `+91${phoneDigits}`;

    // Validate email OTP session server-side
    const { data: emailOtpRecord } = await supabase
      .from("public_otp_verifications")
      .select("id")
      .eq("session_id", email_session_id)
      .eq("identifier_type", "email")
      .eq("identifier", normalizedEmail)
      .not("verified_at", "is", null)
      .maybeSingle();

    if (!emailOtpRecord) {
      return new Response(
        JSON.stringify({ error: "Email verification required. Please verify your email first." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone OTP session server-side
    const { data: phoneOtpRecord } = await supabase
      .from("public_otp_verifications")
      .select("id")
      .eq("session_id", phone_session_id)
      .eq("identifier_type", "phone")
      .eq("identifier", normalizedPhone)
      .not("verified_at", "is", null)
      .maybeSingle();

    if (!phoneOtpRecord) {
      return new Response(
        JSON.stringify({ error: "Phone verification required. Please verify your mobile number first." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedName = org_name.trim();
    let slug = slugify(trimmedName);

    // Ensure slug is unique
    const { data: existingSlug } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Generate a short vendor code prefix from the org name (first 2-3 uppercase letters)
    const prefix = trimmedName
      .replace(/[^a-zA-Z]/g, "")
      .substring(0, 3)
      .toUpperCase() || "ORG";

    // 1. Create tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .insert({
        slug,
        name: trimmedName,
        short_name: trimmedName,
        vendor_code_prefix: prefix,
      })
      .select("id")
      .single();

    if (tenantErr) {
      console.error("Tenant creation failed:", tenantErr);
      return new Response(
        JSON.stringify({ error: "Failed to create organization. Please try again." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create or update auth user (admin)
    // verify-public-otp creates an auth user as a side effect of email OTP verification,
    // so the user may already exist with this email. Check and update password if so.
    const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = existingUsers?.find((u: any) => u.email === normalizedEmail);

    let userId: string;

    if (existingAuthUser) {
      const { data: updated, error: updateErr } = await supabase.auth.admin.updateUser(
        existingAuthUser.id,
        { password: admin_password }
      );
      if (updateErr || !updated?.user) {
        console.error("Auth user update failed:", updateErr);
        await supabase.from("tenants").delete().eq("id", tenant.id);
        return new Response(
          JSON.stringify({ error: "Failed to set account password. Please try again." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = existingAuthUser.id;
    } else {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: admin_password,
        email_confirm: true,
      });
      if (authErr || !authData.user) {
        console.error("Auth user creation failed:", authErr);
        await supabase.from("tenants").delete().eq("id", tenant.id);
        return new Response(
          JSON.stringify({ error: "Failed to create admin account. Please try again." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = authData.user.id;
    }

    // 3. Create profile with tenant_id
    const { error: profileErr } = await supabase.from("profiles").insert({
      user_id: userId,
      tenant_id: tenant.id,
      full_name: admin_name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      department: "Administration",
    });

    if (profileErr) {
      console.error("Profile creation failed:", profileErr);
      // Profile might have been auto-created by a trigger — try update instead
      await supabase
        .from("profiles")
        .update({
          tenant_id: tenant.id,
          full_name: admin_name.trim(),
          phone: normalizedPhone,
          department: "Administration",
        })
        .eq("user_id", userId);
    }

    // 4. Assign admin role
    const { error: roleErr } = await supabase.from("user_roles").insert({
      user_id: userId,
      tenant_id: tenant.id,
      role: "admin",
    });

    if (roleErr) {
      console.error("Role assignment failed:", roleErr);
    }

    // 5. Also assign all workflow roles so the admin can do everything
    for (const role of ["maker", "checker", "approver"]) {
      await supabase.from("user_roles").insert({
        user_id: userId,
        tenant_id: tenant.id,
        role,
      });
    }

    // 6. Seed master data for the new tenant by copying from the default tenant.
    // Without this, vendor_categories / document_types are empty and the
    // "Invite Vendor" category dropdown shows nothing.
    const DEFAULT_TENANT_ID = "a0000000-0000-0000-0000-000000000001";
    try {
      const { data: srcCategories } = await supabase
        .from("vendor_categories")
        .select("name, description, is_active")
        .eq("tenant_id", DEFAULT_TENANT_ID);

      const { data: srcDocTypes } = await supabase
        .from("document_types")
        .select("name, description, sample_url, accepted_formats, max_file_size_mb, has_expiry")
        .eq("tenant_id", DEFAULT_TENANT_ID);

      const { data: srcCategoryDocs } = await supabase
        .from("category_documents")
        .select("category_id, document_type_id, is_mandatory, display_order, vendor_categories!inner(name), document_types!inner(name)")
        .eq("tenant_id", DEFAULT_TENANT_ID);

      // Insert categories for new tenant; map old name -> new id
      const categoryNameToId: Record<string, string> = {};
      if (srcCategories?.length) {
        const { data: insertedCats } = await supabase
          .from("vendor_categories")
          .insert(srcCategories.map(c => ({ ...c, tenant_id: tenant.id })))
          .select("id, name");
        insertedCats?.forEach(c => { categoryNameToId[c.name] = c.id; });
      }

      // Insert document types; map old name -> new id
      const docTypeNameToId: Record<string, string> = {};
      if (srcDocTypes?.length) {
        const { data: insertedDocs } = await supabase
          .from("document_types")
          .insert(srcDocTypes.map(d => ({ ...d, tenant_id: tenant.id })))
          .select("id, name");
        insertedDocs?.forEach(d => { docTypeNameToId[d.name] = d.id; });
      }

      // Insert category_documents using the new tenant's category/doc-type IDs
      if (srcCategoryDocs?.length) {
        const rows = srcCategoryDocs
          .map((cd: any) => {
            const newCategoryId = categoryNameToId[cd.vendor_categories?.name];
            const newDocTypeId = docTypeNameToId[cd.document_types?.name];
            if (!newCategoryId || !newDocTypeId) return null;
            return {
              tenant_id: tenant.id,
              category_id: newCategoryId,
              document_type_id: newDocTypeId,
              is_mandatory: cd.is_mandatory,
              display_order: cd.display_order,
            };
          })
          .filter(Boolean);
        if (rows.length) {
          await supabase.from("category_documents").insert(rows);
        }
      }
    } catch (seedErr) {
      console.error("Master data seeding failed (non-fatal):", seedErr);
    }

    // Note: Trial subscription is auto-created by the trigger on tenants insert
    // (see 20260318100000_subscription_billing.sql)

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        user_id: userId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Organization registration error:", err);
    return new Response(
      JSON.stringify({ error: "Registration failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
