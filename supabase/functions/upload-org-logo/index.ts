import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Logos are shown unauthenticated on login/registration pages, so they live in
// a separate public R2 bucket — never the private vendorverification-files
// bucket, which holds KYC/invoice documents and must stay non-public.
const ALLOWED_MIME_TYPES: { [key: string]: string[] } = {
  png: ["image/png"],
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  svg: ["image/svg+xml"],
  webp: ["image/webp"],
};
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cfAccountId = Deno.env.get("CF_ACCOUNT_ID");
    const cfApiToken = Deno.env.get("CF_API_TOKEN");
    const publicBucket = Deno.env.get("R2_PUBLIC_BUCKET");
    const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN");

    if (!cfAccountId || !cfApiToken || !publicBucket || !publicDomain) {
      console.error("R2 public bucket not configured");
      return jsonResponse({ error: "File storage not configured" }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const { data: tenantId, error: tenantErr } = await admin.rpc("get_user_tenant_id", { _user_id: userId });
    if (tenantErr || !tenantId) {
      return jsonResponse({ error: "Could not resolve your organization" }, 400);
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return jsonResponse({ error: "Missing file" }, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return jsonResponse({ error: "File too large. Max size 2 MB." }, 400);
    }

    const ext = (file.name || "").split(".").pop()?.toLowerCase() || "";
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(file.type)) {
      return jsonResponse({ error: "Invalid file type. Use PNG, JPG, SVG or WEBP." }, 400);
    }

    const key = `logos/${tenantId}/${Date.now()}.${ext}`;

    const putResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/r2/buckets/${publicBucket}/objects/${key}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          "Content-Type": file.type,
        },
        body: await file.arrayBuffer(),
      },
    );

    if (!putResp.ok) {
      console.error("R2 upload failed:", putResp.status, await putResp.text());
      return jsonResponse({ error: "Upload failed" }, 500);
    }

    const logoUrl = `https://${publicDomain}/${key}`;

    const { error: updateErr } = await admin
      .from("tenants")
      .update({ logo_url: logoUrl })
      .eq("id", tenantId);

    if (updateErr) {
      console.error("Failed to save logo_url:", updateErr);
      return jsonResponse({ error: "Uploaded but failed to save. Try again." }, 500);
    }

    return jsonResponse({ success: true, logo_url: logoUrl });
  } catch (error) {
    console.error("Error in upload-org-logo:", error);
    return jsonResponse({ error: (error as Error).message || "Internal server error" }, 500);
  }
});
