import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const token = form.get("token") as string | null;
    const documentTypeId = form.get("document_type_id") as string | null;

    if (!file || !token || !documentTypeId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
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

    // Validate token - try vendor_invitations first, then staff_referral_codes
    let identifier: string;
    let vendorId: string | null = null;
    let invitationTenantId: string | null = null;

    const { data: invitation } = await supabase
      .from("vendor_invitations")
      .select("id, vendor_id, tenant_id")
      .eq("token", token)
      .single();

    if (invitation) {
      identifier = invitation.id;
      vendorId = invitation.vendor_id;
      invitationTenantId = invitation.tenant_id;
    } else {
      const { data: refCode } = await supabase
        .from("staff_referral_codes")
        .select("id")
        .eq("referral_code", token)
        .eq("is_active", true)
        .single();

      if (!refCode) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      identifier = refCode.id;
    }

    // Generate unique file path with sanitized name
    const sanitizedName = sanitizeFileName(fileName);
    const filePath = `referral/${identifier}/${documentTypeId}/${Date.now()}_${sanitizedName}`;

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

    // If vendor already created (invitation flow), link the document
    if (vendorId) {
      const { data: docRecord } = await supabase.from("vendor_documents").insert({
        vendor_id: vendorId,
        document_type_id: documentTypeId,
        file_name: sanitizedName,
        file_url: filePath,
        file_size_bytes: file.size,
        status: "uploaded",
        tenant_id: invitationTenantId,
      }).select("id").single();

      // Fire-and-forget: trigger AI analysis
      if (docRecord?.id) {
        fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ document_id: docRecord.id }),
        }).catch((err) => console.error("Auto-analysis trigger failed:", err));
      }
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
