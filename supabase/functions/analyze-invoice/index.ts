import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VISION_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
const TEXT_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are reading a vendor invoice or purchase order for an Indian B2B accounts-payable system. Extract exactly the fields below from the document. If a field is not present or not legible, return null for its value and 0 for its confidence — never guess.

Fields:
- invoice_number: the invoice / bill number printed on the document
- invoice_date: the invoice date, converted to ISO format YYYY-MM-DD
- invoice_amount: the TOTAL amount payable, including GST/tax (numeric, no currency symbol or commas)
- gst_amount: the GST/tax portion only (numeric). If the document shows tax as multiple lines (CGST+SGST or IGST), sum them.
- po_number: the purchase order number referenced on the document, if any
- description: a short (under 15 words) plain-English summary of the goods or services billed, in your own words

Give each field a confidence 0-100 (100 = certain, 0 = not found). Always call the invoice_extraction_result tool with your findings.`;

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "invoice_extraction_result",
    description: "Return the structured fields extracted from the invoice/PO",
    parameters: {
      type: "object",
      properties: {
        invoice_number: { type: ["string", "null"] },
        invoice_number_confidence: { type: ["integer", "string"] },
        invoice_date: { type: ["string", "null"], description: "ISO format YYYY-MM-DD" },
        invoice_date_confidence: { type: ["integer", "string"] },
        invoice_amount: { type: ["number", "string", "null"] },
        invoice_amount_confidence: { type: ["integer", "string"] },
        gst_amount: { type: ["number", "string", "null"] },
        gst_amount_confidence: { type: ["integer", "string"] },
        po_number: { type: ["string", "null"] },
        po_number_confidence: { type: ["integer", "string"] },
        description: { type: ["string", "null"] },
        overall_confidence: { type: ["integer", "string"], description: "0-100 overall read quality" },
      },
      required: [
        "invoice_number", "invoice_number_confidence",
        "invoice_date", "invoice_date_confidence",
        "invoice_amount", "invoice_amount_confidence",
        "gst_amount", "gst_amount_confidence",
        "po_number", "po_number_confidence",
        "description", "overall_confidence",
      ],
    },
  },
};

interface ExtractionResult {
  invoice_number: string | null;
  invoice_number_confidence: number;
  invoice_date: string | null;
  invoice_date_confidence: number;
  invoice_amount: number | null;
  invoice_amount_confidence: number;
  gst_amount: number | null;
  gst_amount_confidence: number;
  po_number: string | null;
  po_number_confidence: number;
  description: string | null;
  overall_confidence: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callGroq(
  apiKey: string,
  model: string,
  userContent: unknown,
): Promise<{ ok: true; result: ExtractionResult } | { ok: false; status: number; message: string }> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "invoice_extraction_result" } },
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
    const toInt = (v: unknown): number => {
      const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const toStr = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const result: ExtractionResult = {
      invoice_number: toStr(raw.invoice_number),
      invoice_number_confidence: toInt(raw.invoice_number_confidence),
      invoice_date: toStr(raw.invoice_date),
      invoice_date_confidence: toInt(raw.invoice_date_confidence),
      invoice_amount: toNum(raw.invoice_amount),
      invoice_amount_confidence: toInt(raw.invoice_amount_confidence),
      gst_amount: toNum(raw.gst_amount),
      gst_amount_confidence: toInt(raw.gst_amount_confidence),
      po_number: toStr(raw.po_number),
      po_number_confidence: toInt(raw.po_number_confidence),
      description: toStr(raw.description),
      overall_confidence: toInt(raw.overall_confidence),
    };
    return { ok: true, result };
  } catch (e) {
    return { ok: false, status: 502, message: `Failed to parse tool arguments: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cfAccountId = Deno.env.get("CF_ACCOUNT_ID");
    const cfApiToken = Deno.env.get("CF_API_TOKEN");
    const bucket = Deno.env.get("R2_BUCKET") || "vendorverification-files";
    const groqApiKey = Deno.env.get("GROQ_API_KEY");

    if (!cfAccountId || !cfApiToken) {
      return jsonResponse({ success: false, error: "File storage not configured" }, 500);
    }
    if (!groqApiKey) {
      return jsonResponse({ success: false, error: "AI reader not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ success: false, error: "Not signed in" }, 401);
    }

    const { data: link } = await admin
      .from("vendor_users")
      .select("vendor_id, tenant_id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!link || link.is_active === false) {
      return jsonResponse({ success: false, error: "Only vendor accounts can use this" }, 403);
    }

    const { file_key } = await req.json();
    if (!file_key || typeof file_key !== "string") {
      return jsonResponse({ success: false, error: "file_key is required" }, 400);
    }
    const expectedPrefix = `invoices/${link.tenant_id}/${link.vendor_id}/`;
    if (!file_key.startsWith(expectedPrefix)) {
      return jsonResponse({ success: false, error: "Not authorized for this file" }, 403);
    }

    const objUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/r2/buckets/${bucket}/objects/${file_key}`;
    const objResp = await fetch(objUrl, { headers: { Authorization: `Bearer ${cfApiToken}` } });
    if (!objResp.ok) {
      return jsonResponse({ success: false, error: "File not found in storage" }, 404);
    }

    const mimeType = (objResp.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const arrayBuffer = await objResp.arrayBuffer();

    let aiCall: Awaited<ReturnType<typeof callGroq>>;

    if (mimeType === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const trimmed = (text || "").trim().slice(0, 30000);

      if (!trimmed) {
        return jsonResponse({
          success: false,
          error: "This PDF has no extractable text (looks like a scanned image). Please fill in the details manually.",
        }, 422);
      }

      aiCall = await callGroq(groqApiKey, TEXT_MODEL, [
        { type: "text", text: `Document text:\n${trimmed}` },
      ]);
    } else {
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
        : "image/png";
      const dataUrl = `data:${imageMime};base64,${base64}`;

      aiCall = await callGroq(groqApiKey, VISION_MODEL, [
        { type: "text", text: "Read this invoice/purchase order image and extract the fields." },
        { type: "image_url", image_url: { url: dataUrl } },
      ]);
    }

    if (!aiCall.ok) {
      const errorMsg = aiCall.status === 429
        ? "AI reader is busy right now, please fill in the details manually"
        : aiCall.status === 401 || aiCall.status === 403
        ? "AI reader is not available right now, please fill in the details manually"
        : "Could not read this file automatically, please fill in the details manually";
      return jsonResponse({ success: false, error: errorMsg }, aiCall.status === 429 ? 429 : 500);
    }

    return jsonResponse({
      success: true,
      data: {
        ...aiCall.result,
        ai_model_version: mimeType === "application/pdf" ? `groq:${TEXT_MODEL}` : `groq:${VISION_MODEL}`,
      },
    });
  } catch (error) {
    console.error("Invoice analysis error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return jsonResponse({ success: false, error: message.slice(0, 300) }, 500);
  }
});
