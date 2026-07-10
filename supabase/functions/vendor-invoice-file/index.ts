import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

const EXTENSION_MIME_MAP: { [key: string]: string[] } = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
};

function validateMimeType(ext: string, mimeType: string): boolean {
  const extLower = ext.toLowerCase();
  if (!EXTENSION_MIME_MAP[extLower]) return false;
  return EXTENSION_MIME_MAP[extLower].includes(mimeType);
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 120);
}

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cfAccountId = Deno.env.get("CF_ACCOUNT_ID");
    const cfApiToken = Deno.env.get("CF_API_TOKEN");
    const bucket = Deno.env.get("R2_BUCKET") || "vendorverification-files";

    if (!cfAccountId || !cfApiToken) {
      console.error("R2 credentials not configured");
      return jsonResponse({ error: "File storage not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Identify the caller from their session token
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ error: "Not signed in" }, 401);
    }

    const r2ObjectUrl = (key: string) =>
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/r2/buckets/${bucket}/objects/${key}`;

    // ===== POST: vendor uploads an invoice / PO file =====
    if (req.method === "POST") {
      const { data: link } = await admin
        .from("vendor_users")
        .select("vendor_id, tenant_id, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!link || link.is_active === false) {
        return jsonResponse({ error: "Only vendor accounts can upload files" }, 403);
      }

      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return jsonResponse({ error: "Missing file" }, 400);
      }

      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        return jsonResponse({ error: "File too large (max 10MB)" }, 400);
      }

      const fileName = file.name || "";
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      if (!ext || !validateMimeType(ext, file.type)) {
        return jsonResponse({ error: "Invalid file type. Use PDF, JPG or PNG." }, 400);
      }

      const key = `invoices/${link.tenant_id}/${link.vendor_id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${sanitizeFileName(fileName)}`;

      const putResp = await fetch(r2ObjectUrl(key), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          "Content-Type": file.type,
        },
        body: await file.arrayBuffer(),
      });

      if (!putResp.ok) {
        console.error("R2 upload failed:", putResp.status, await putResp.text());
        return jsonResponse({ error: "Upload failed" }, 500);
      }

      return jsonResponse({ success: true, file_key: key });
    }

    // ===== GET: download a file (vendor owns it, or staff of the tenant) =====
    if (req.method === "GET") {
      const key = new URL(req.url).searchParams.get("key") || "";
      if (!key.startsWith("invoices/")) {
        return jsonResponse({ error: "Invalid file key" }, 400);
      }

      let { data: invoice } = await admin
        .from("vendor_invoices")
        .select("id, tenant_id, vendor_id")
        .eq("invoice_file_key", key)
        .maybeSingle();
      if (!invoice) {
        ({ data: invoice } = await admin
          .from("vendor_invoices")
          .select("id, tenant_id, vendor_id")
          .eq("po_file_key", key)
          .maybeSingle());
      }
      if (!invoice) {
        return jsonResponse({ error: "File not found" }, 404);
      }

      const { data: link } = await admin
        .from("vendor_users")
        .select("vendor_id")
        .eq("user_id", user.id)
        .maybeSingle();
      let allowed = link?.vendor_id === invoice.vendor_id;

      if (!allowed) {
        const { data: staff } = await admin
          .from("profiles")
          .select("tenant_id, is_active")
          .eq("user_id", user.id)
          .maybeSingle();
        allowed = !!staff && staff.is_active === true && staff.tenant_id === invoice.tenant_id;
      }

      if (!allowed) {
        return jsonResponse({ error: "Not authorized for this file" }, 403);
      }

      const obj = await fetch(r2ObjectUrl(key), {
        headers: { Authorization: `Bearer ${cfApiToken}` },
      });
      if (!obj.ok) {
        console.error("R2 fetch failed:", obj.status);
        return jsonResponse({ error: "File not found in storage" }, 404);
      }

      return new Response(obj.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": obj.headers.get("content-type") || "application/octet-stream",
          "Content-Disposition": `inline; filename="${key.split("/").pop()}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Error in vendor-invoice-file:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
