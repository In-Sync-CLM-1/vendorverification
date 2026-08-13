import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Allowed MIME types for validation
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];

// File extension mapping
const EXTENSION_MIME_MAP: { [key: string]: string[] } = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
};

function validateMimeType(ext: string, mimeType: string): boolean {
  const ext_lower = ext.toLowerCase();
  if (!EXTENSION_MIME_MAP[ext_lower]) {
    return false;
  }
  return EXTENSION_MIME_MAP[ext_lower].includes(mimeType);
}

function sanitizeFileName(fileName: string): string {
  // Remove path traversal characters
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return new Response(JSON.stringify({ error: "Invalid request format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const sessionId = form.get("session_id") as string | null;
    const documentTypeId = form.get("document_type_id") as string | null;

    if (!file || !sessionId || !documentTypeId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate session_id is a valid UUID format
    if (!isValidUUID(sessionId)) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (max 20MB)
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file extension and MIME type
    const fileName = file.name || "";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    if (!ext || !validateMimeType(ext, file.type)) {
      return new Response(JSON.stringify({ error: "Invalid file type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Generate unique file path with sanitized name
    const sanitizedName = sanitizeFileName(fileName);
    const filePath = `self-register/${sessionId}/${documentTypeId}/${Date.now()}_${sanitizedName}`;

    // Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from("vendor-documents")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error("Upload failed");
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, file_path: filePath }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Request processing failed");
    return new Response(JSON.stringify({ error: "Upload failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
