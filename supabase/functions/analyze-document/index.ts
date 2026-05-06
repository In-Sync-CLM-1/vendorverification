import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// PII masking helpers
function maskPAN(value: string): string {
  if (!value || value.length < 5) return value;
  return value.substring(0, 2) + "***" + value.substring(value.length - 2);
}

function maskAccountNumber(value: string): string {
  if (!value || value.length < 4) return value;
  return "****" + value.substring(value.length - 4);
}

function maskMobile(value: string): string {
  if (!value || value.length < 4) return value;
  return "****" + value.substring(value.length - 4);
}

function maskIFSC(value: string): string {
  // IFSC is semi-public (identifies branch), show as-is
  return value;
}

const PII_FIELDS: Record<string, (v: string) => string> = {
  "pan_number": maskPAN,
  "pan": maskPAN,
  "account_number": maskAccountNumber,
  "bank_account_number": maskAccountNumber,
  "mobile": maskMobile,
  "phone": maskMobile,
  "contact_number": maskMobile,
};

function maskFieldValue(fieldName: string, value: string): string {
  const normalizedName = fieldName.toLowerCase().replace(/\s+/g, "_");
  for (const [key, maskFn] of Object.entries(PII_FIELDS)) {
    if (normalizedName.includes(key)) {
      return maskFn(value);
    }
  }
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ success: false, error: "document_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch document record
    const { data: doc, error: docError } = await supabase
      .from("vendor_documents")
      .select("id, file_url, file_name, vendor_id, document_type_id, tenant_id")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if analysis already exists
    const { data: existingAnalysis } = await supabase
      .from("document_analyses")
      .select("id, analysis_status")
      .eq("document_id", document_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let analysisId: string;

    if (existingAnalysis && existingAnalysis.analysis_status === "processing") {
      return new Response(
        JSON.stringify({ success: false, error: "Analysis already in progress" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingAnalysis) {
      // Update existing
      analysisId = existingAnalysis.id;
      await supabase
        .from("document_analyses")
        .update({ analysis_status: "processing", updated_at: new Date().toISOString() })
        .eq("id", analysisId);
    } else {
      // Create new
      const { data: newAnalysis, error: insertError } = await supabase
        .from("document_analyses")
        .insert({ document_id, analysis_status: "processing", tenant_id: doc.tenant_id })
        .select("id")
        .single();

      if (insertError || !newAnalysis) {
        throw new Error("Failed to create analysis record");
      }
      analysisId = newAnalysis.id;
    }

    // Download the document file (generate signed URL from storage path)
    let fileBase64: string;
    let mimeType: string;
    try {
      let downloadUrl = doc.file_url;
      if (!doc.file_url.startsWith("http")) {
        const { data: signedData, error: signError } = await supabase.storage
          .from("vendor-documents")
          .createSignedUrl(doc.file_url, 300);
        if (signError || !signedData?.signedUrl) {
          throw new Error("Failed to generate signed URL for document");
        }
        downloadUrl = signedData.signedUrl;
      }
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) throw new Error("Failed to download document file");
      
      const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";
      mimeType = contentType.split(";")[0].trim();
      
      const arrayBuffer = await fileResponse.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Convert to base64
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      fileBase64 = btoa(binary);
    } catch (e) {
      console.error("File download error:", e);
      await supabase
        .from("document_analyses")
        .update({ 
          analysis_status: "failed", 
          error_message: "Failed to download document file",
          updated_at: new Date().toISOString() 
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ success: false, error: "Failed to download document file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Anthropic Claude Haiku for document analysis
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const systemPrompt = `You are a document analysis AI for an Indian vendor onboarding platform. You analyze uploaded documents (GST Certificates, PAN Cards, Cancelled Cheques, Trade Licenses, Certificates of Incorporation, etc.) and extract key information.

Your tasks:
1. Identify the document type
2. Extract all key fields from the document with confidence scores (0-100)
3. Assess any tampering indicators (font inconsistencies, metadata anomalies, visual artifacts, etc.)
4. Provide an overall confidence score and tampering risk score (0-100, where 0 = no tampering, 100 = definitely tampered)

For each extracted field, provide:
- field_name: Human-readable name (e.g., "GSTIN", "PAN Number", "Account Number", "Legal Name", "IFSC Code", "Registration Date")
- value: The extracted value exactly as it appears
- confidence: 0-100 confidence score for this extraction

Be thorough and extract ALL visible fields from the document.`;

    // Build the file content block — PDFs use "document" type, images use "image" type
    const isPdf = mimeType === "application/pdf";
    const fileContentBlock = isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBase64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type:
              mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg"
              : mimeType === "image/png" ? "image/png"
              : mimeType === "image/gif" ? "image/gif"
              : mimeType === "image/webp" ? "image/webp"
              : "image/png",
            data: fileBase64,
          },
        };

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              fileContentBlock,
              {
                type: "text",
                text: `Analyze this document. The file name is: ${doc.file_name}. Extract all key fields, detect the document type, and assess tampering risk.`,
              },
            ],
          },
        ],
        tools: [
          {
            name: "document_analysis_result",
            description: "Return the structured analysis results for the document",
            input_schema: {
              type: "object",
              properties: {
                document_type: {
                  type: "string",
                  description: "Detected document type (e.g., 'GST Certificate', 'PAN Card', 'Cancelled Cheque', 'Trade License', 'Certificate of Incorporation')",
                },
                classification_confidence: {
                  type: "integer",
                  description: "Confidence in document type detection (0-100)",
                },
                extracted_fields: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field_name: { type: "string" },
                      value: { type: "string" },
                      confidence: { type: "integer" },
                    },
                    required: ["field_name", "value", "confidence"],
                  },
                },
                overall_confidence: {
                  type: "integer",
                  description: "Overall confidence in the extraction quality (0-100)",
                },
                tampering_score: {
                  type: "integer",
                  description: "Risk of tampering (0-100, 0=clean, 100=definitely tampered)",
                },
                tampering_indicators: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of specific tampering indicators found, if any",
                },
              },
              required: [
                "document_type",
                "classification_confidence",
                "extracted_fields",
                "overall_confidence",
                "tampering_score",
                "tampering_indicators",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "document_analysis_result" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);

      const errorMsg = aiResponse.status === 429
        ? "Rate limit exceeded, please try again later"
        : aiResponse.status === 402
        ? "AI credits exhausted, please add funds"
        : "AI analysis failed";

      await supabase
        .from("document_analyses")
        .update({ 
          analysis_status: "failed", 
          error_message: errorMsg,
          updated_at: new Date().toISOString() 
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: aiResponse.status === 429 ? 429 : aiResponse.status === 402 ? 402 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolUseBlock = aiData.content?.find((block: any) => block.type === "tool_use");

    if (!toolUseBlock || !toolUseBlock.input) {
      await supabase
        .from("document_analyses")
        .update({
          analysis_status: "failed",
          error_message: "AI did not return structured results",
          updated_at: new Date().toISOString()
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ success: false, error: "AI analysis returned no structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysisResult = toolUseBlock.input;

    // Mask PII in extracted fields before storing
    const maskedExtractedData = (analysisResult.extracted_fields || []).map(
      (field: { field_name: string; value: string; confidence: number }) => ({
        field_name: field.field_name,
        extracted_value: maskFieldValue(field.field_name, field.value),
        confidence: field.confidence,
        entered_value: null,
        is_match: false,
      })
    );

    // Save results
    const now = new Date().toISOString();
    await supabase
      .from("document_analyses")
      .update({
        analysis_status: "completed",
        extracted_data: maskedExtractedData,
        document_type_detected: analysisResult.document_type,
        classification_confidence: analysisResult.classification_confidence,
        confidence_score: analysisResult.overall_confidence,
        tampering_indicators: analysisResult.tampering_indicators || [],
        tampering_score: analysisResult.tampering_score,
        ai_model_version: "claude-haiku-4.5",
        analyzed_at: now,
        updated_at: now,
        error_message: null,
      })
      .eq("id", analysisId);

    // Fetch the complete record to return
    const { data: finalAnalysis } = await supabase
      .from("document_analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    return new Response(
      JSON.stringify({ success: true, data: finalAnalysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Document analysis error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
