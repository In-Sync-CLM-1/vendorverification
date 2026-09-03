import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.112.3";

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

// Groq decommissioned every Llama model this used (both text and vision) — see
// https://console.groq.com/docs/deprecations. Text now runs on Groq's own gpt-oss model;
// vision has no Groq replacement at all, so images route to Claude instead (same provider
// analyze-invoice already uses for its image path).
const CLAUDE_VISION_MODEL = "claude-opus-4-8";
const TEXT_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You are a document analysis AI for an Indian vendor onboarding platform. You analyze uploaded documents (GST Certificates, PAN Cards, Cancelled Cheques, Trade Licenses, Certificates of Incorporation, etc.) and extract key information.

Your tasks:
1. Identify the document type
2. Extract all key fields from the document with confidence scores (0-100)
3. Assess any tampering indicators (font inconsistencies, metadata anomalies, visual artifacts, etc.)
4. Provide an overall confidence score and tampering risk score (0-100, where 0 = no tampering, 100 = definitely tampered)

For each extracted field, provide:
- field_name: Human-readable name (e.g., "GSTIN", "PAN Number", "Account Number", "Legal Name", "IFSC Code", "Registration Date")
- value: The extracted value exactly as it appears
- confidence: 0-100 confidence score for this extraction

Be thorough and extract ALL visible fields from the document. Always call the document_analysis_result tool with your structured findings.`;

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "document_analysis_result",
    description: "Return the structured analysis results for the document",
    parameters: {
      type: "object",
      properties: {
        document_type: {
          type: "string",
          description: "Detected document type (e.g., 'GST Certificate', 'PAN Card', 'Cancelled Cheque', 'Trade License', 'Certificate of Incorporation')",
        },
        classification_confidence: { type: ["integer", "string"], description: "0-100" },
        extracted_fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_name: { type: "string" },
              value: { type: "string" },
              confidence: { type: ["integer", "string"] },
            },
            required: ["field_name", "value", "confidence"],
          },
        },
        overall_confidence: { type: ["integer", "string"], description: "0-100" },
        tampering_score: { type: ["integer", "string"], description: "0-100, 0=clean, 100=definitely tampered" },
        tampering_indicators: { type: "array", items: { type: "string" } },
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
};

const ANTHROPIC_ANALYSIS_TOOL = {
  name: "document_analysis_result",
  description: "Return the structured analysis results for the document",
  input_schema: ANALYSIS_TOOL.function.parameters,
};

interface AnalysisResult {
  document_type: string;
  classification_confidence: number;
  extracted_fields: { field_name: string; value: string; confidence: number }[];
  overall_confidence: number;
  tampering_score: number;
  tampering_indicators: string[];
}

function normalizeAnalysis(raw: Record<string, unknown>): AnalysisResult {
  const toInt = (v: unknown): number => {
    const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    document_type: String(raw.document_type ?? ""),
    classification_confidence: toInt(raw.classification_confidence),
    extracted_fields: Array.isArray(raw.extracted_fields)
      ? (raw.extracted_fields as { field_name?: unknown; value?: unknown; confidence?: unknown }[]).map((f) => ({
          field_name: String(f.field_name ?? ""),
          value: String(f.value ?? ""),
          confidence: toInt(f.confidence),
        }))
      : [],
    overall_confidence: toInt(raw.overall_confidence),
    tampering_score: toInt(raw.tampering_score),
    tampering_indicators: Array.isArray(raw.tampering_indicators)
      ? (raw.tampering_indicators as unknown[]).map((s) => String(s))
      : [],
  };
}

async function callGroq(
  apiKey: string,
  model: string,
  userContent: unknown,
): Promise<{ ok: true; result: AnalysisResult } | { ok: false; status: number; message: string }> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "document_analysis_result" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Groq error:", response.status, text);
    return { ok: false, status: response.status, message: `${response.status}: ${text}` };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    return { ok: false, status: 502, message: "Groq did not return tool call output" };
  }

  try {
    const raw = JSON.parse(toolCall.function.arguments);
    return { ok: true, result: normalizeAnalysis(raw) };
  } catch (e) {
    return { ok: false, status: 502, message: `Failed to parse tool arguments: ${(e as Error).message}` };
  }
}

async function callClaudeVision(
  apiKey: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  base64Data: string,
  fileName: string,
): Promise<{ ok: true; result: AnalysisResult } | { ok: false; status: number; message: string }> {
  const anthropic = new Anthropic({ apiKey });
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [ANTHROPIC_ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "document_analysis_result" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze this document. The file name is: ${fileName}. Extract all key fields, detect the document type, and assess tampering risk.` },
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use") as
      | { type: "tool_use"; input: Record<string, unknown> }
      | undefined;
    if (!toolUse) {
      return { ok: false, status: 502, message: "Claude did not return tool call output" };
    }
    return { ok: true, result: normalizeAnalysis(toolUse.input) };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("Claude vision error:", e.status, e.message);
      return { ok: false, status: e.status ?? 500, message: `${e.status}: ${e.message}` };
    }
    console.error("Claude vision error:", e);
    return { ok: false, status: 500, message: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let analysisId: string | null = null;

  try {
    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ success: false, error: "document_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: doc, error: docError } = await supabase
      .from("vendor_documents")
      .select("id, file_url, file_name, vendor_id, document_type_id, tenant_id")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existingAnalysis } = await supabase
      .from("document_analyses")
      .select("id, analysis_status")
      .eq("document_id", document_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAnalysis?.analysis_status === "processing") {
      return new Response(
        JSON.stringify({ success: false, error: "Analysis already in progress" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (existingAnalysis) {
      analysisId = existingAnalysis.id;
      await supabase
        .from("document_analyses")
        .update({ analysis_status: "processing", updated_at: new Date().toISOString() })
        .eq("id", analysisId);
    } else {
      const { data: newAnalysis, error: insertError } = await supabase
        .from("document_analyses")
        .insert({ document_id, analysis_status: "processing", tenant_id: doc.tenant_id })
        .select("id")
        .single();
      if (insertError || !newAnalysis) throw new Error("Failed to create analysis record");
      analysisId = newAnalysis.id;
    }

    // Download the file
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
    const mimeType = contentType.split(";")[0].trim();
    const arrayBuffer = await fileResponse.arrayBuffer();

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    let aiCall: Awaited<ReturnType<typeof callGroq>> | Awaited<ReturnType<typeof callClaudeVision>>;
    let usedModel: string = mimeType === "application/pdf" ? `groq:${TEXT_MODEL}` : `claude:${CLAUDE_VISION_MODEL}`;

    if (mimeType === "application/pdf") {
      // Extract text from the PDF, then send to Groq's text model
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const trimmed = (text || "").trim().slice(0, 30000); // hard cap to keep prompt sane

      if (!trimmed) {
        await supabase
          .from("document_analyses")
          .update({
            analysis_status: "failed",
            error_message: "PDF appears to be image-only / no extractable text",
            updated_at: new Date().toISOString(),
          })
          .eq("id", analysisId);
        return new Response(
          JSON.stringify({ success: false, error: "PDF has no extractable text. Please upload as image instead." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      aiCall = await callGroq(GROQ_API_KEY, TEXT_MODEL, [
        { type: "text", text: `File name: ${doc.file_name}\n\nDocument text:\n${trimmed}` },
      ]);
    } else {
      // Image path — Groq has no vision model available anymore, so this goes to Claude instead
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);
      const imageMime =
        mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg"
        : mimeType === "image/png" ? "image/png"
        : mimeType === "image/gif" ? "image/gif"
        : mimeType === "image/webp" ? "image/webp"
        : "image/png";

      aiCall = await callClaudeVision(ANTHROPIC_API_KEY, imageMime, base64, doc.file_name);
    }

    if (!aiCall.ok) {
      const errorMsg = aiCall.status === 429
        ? "Rate limit exceeded, please try again later"
        : aiCall.status === 401 || aiCall.status === 403
        ? "AI provider rejected the API key — please update GROQ_API_KEY / ANTHROPIC_API_KEY"
        : `AI analysis failed (${aiCall.message.slice(0, 200)})`;

      await supabase
        .from("document_analyses")
        .update({
          analysis_status: "failed",
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: aiCall.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const analysisResult = aiCall.result;

    const maskedExtractedData = (analysisResult.extracted_fields || []).map((field) => ({
      field_name: field.field_name,
      extracted_value: maskFieldValue(field.field_name, field.value),
      confidence: field.confidence,
      entered_value: null,
      is_match: false,
    }));

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
        ai_model_version: usedModel,
        analyzed_at: now,
        updated_at: now,
        error_message: null,
      })
      .eq("id", analysisId);

    const { data: finalAnalysis } = await supabase
      .from("document_analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    return new Response(
      JSON.stringify({ success: true, data: finalAnalysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Document analysis error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    if (analysisId) {
      await supabase
        .from("document_analyses")
        .update({
          analysis_status: "failed",
          error_message: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysisId);
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
