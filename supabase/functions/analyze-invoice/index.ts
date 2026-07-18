import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, extractImages, getDocumentProxy, getResolvedPDFJS } from "https://esm.sh/unpdf@0.12.1";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLAUDE_VISION_MODEL = "claude-opus-4-8";
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

const ANTHROPIC_EXTRACTION_TOOL = {
  name: "invoice_extraction_result",
  description: "Return the structured fields extracted from the invoice/PO",
  input_schema: EXTRACTION_TOOL.function.parameters,
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

function normalizeExtraction(raw: Record<string, unknown>): ExtractionResult {
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
  return {
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
    return { ok: true, result: normalizeExtraction(raw) };
  } catch (e) {
    return { ok: false, status: 502, message: `Failed to parse tool arguments: ${(e as Error).message}` };
  }
}

async function callClaudeVision(
  apiKey: string,
  mediaType: "image/jpeg" | "image/png",
  base64Data: string,
): Promise<{ ok: true; result: ExtractionResult } | { ok: false; status: number; message: string }> {
  const anthropic = new Anthropic({ apiKey });
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [ANTHROPIC_EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "invoice_extraction_result" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this invoice/purchase order image and extract the fields." },
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
    return { ok: true, result: normalizeExtraction(toolUse.input) };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("Claude vision error:", e.status, e.message);
      return { ok: false, status: e.status ?? 500, message: `${e.status}: ${e.message}` };
    }
    console.error("Claude vision error:", e);
    return { ok: false, status: 500, message: (e as Error).message };
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32be(data.length), 0);
  out.set(body, 4);
  out.set(u32be(crc32(body)), 4 + body.length);
  return out;
}

async function deflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  for await (const c of cs.readable as unknown as AsyncIterable<Uint8Array>) chunks.push(c);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/** Encodes raw (uncompressed, filter-free) pixel data as a PNG. `channels` is bytes per pixel: 1=gray, 2=gray+alpha, 3=RGB, 4=RGBA. */
async function pixelsToPng(pixels: Uint8Array, width: number, height: number, channels: number): Promise<Uint8Array> {
  const colorType = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels as 1 | 2 | 3 | 4];
  const stride = width * channels;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (1 + stride) + 1);
  }
  const compressed = await deflateZlib(raw);

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

/**
 * Some invoice PDFs (e.g. exported via jsPDF from a web app) have no real text layer —
 * the whole page is one embedded raster image. extractText finds nothing even though the
 * document isn't a scan. This scans pages for the largest embedded image and re-encodes it
 * as a base64 PNG so it can be sent through the same vision-model path used for JPG/PNG uploads.
 */
async function extractLargestImageAsPngBase64(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string | null> {
  const pdfjs = await getResolvedPDFJS();
  const pageCount = Math.min(pdf.numPages, 5);
  let best: { pageNum: number; width: number; height: number } | null = null;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const opList = await page.getOperatorList();
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (opList.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const [, width, height] = opList.argsArray[i] as [string, number, number];
      if (!best || width * height > best.width * best.height) {
        best = { pageNum, width, height };
      }
    }
  }
  if (!best) return null;

  const images = await extractImages(pdf, best.pageNum);
  if (!images.length) return null;
  const pixels = images.reduce((a, b) => (a.length >= b.length ? a : b));
  const channels = Math.round(pixels.length / (best.width * best.height));
  if (![1, 2, 3, 4].includes(channels) || channels * best.width * best.height !== pixels.length) return null;

  const png = await pixelsToPng(pixels, best.width, best.height, channels);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < png.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(png.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
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
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!cfAccountId || !cfApiToken) {
      return jsonResponse({ success: false, error: "File storage not configured" }, 500);
    }
    if (!groqApiKey || !anthropicApiKey) {
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

    let aiCall: Awaited<ReturnType<typeof callGroq>> | Awaited<ReturnType<typeof callClaudeVision>>;
    let usedModel: string = mimeType === "application/pdf" ? `groq:${TEXT_MODEL}` : `claude:${CLAUDE_VISION_MODEL}`;

    if (mimeType === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const trimmed = (text || "").trim().slice(0, 30000);

      if (!trimmed) {
        const imageBase64 = await extractLargestImageAsPngBase64(pdf).catch((e) => {
          console.error("PDF image fallback extraction failed:", e);
          return null;
        });
        if (!imageBase64) {
          return jsonResponse({
            success: false,
            error: "This PDF has no extractable text or image content. Please fill in the details manually.",
          }, 422);
        }
        usedModel = `claude:${CLAUDE_VISION_MODEL}`;
        aiCall = await callClaudeVision(anthropicApiKey, "image/png", imageBase64);
      } else {
        aiCall = await callGroq(groqApiKey, TEXT_MODEL, [
          { type: "text", text: `Document text:\n${trimmed}` },
        ]);
      }
    } else {
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);
      const imageMime: "image/jpeg" | "image/png" =
        mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg" : "image/png";

      aiCall = await callClaudeVision(anthropicApiKey, imageMime, base64);
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
        ai_model_version: usedModel,
      },
    });
  } catch (error) {
    console.error("Invoice analysis error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return jsonResponse({ success: false, error: message.slice(0, 300) }, 500);
  }
});
