import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Both retired by Groq (2026-09, confirmed live: 404 model_not_found on this
// account) -- this function has no fallback provider at all, so every
// statement upload (text, PDF, CSV, and image) was failing outright until
// fixed. qwen/qwen3.6-27b confirmed live to support both vision AND
// tool-calling together (the pattern this function uses) -- distinct from
// the Responses-API json_schema format that's still broken on it elsewhere
// (see rmpl's _shared/groq.ts). openai/gpt-oss-120b confirmed live +
// tool-calling capable for the text path, same as the rest of this sweep.
const VISION_MODEL = "qwen/qwen3.6-27b";
const TEXT_MODEL = "openai/gpt-oss-120b";
const MAX_LINES = 200;

const SYSTEM_PROMPT = `You are reading a bank account statement (or a pasted list of payment references) for an Indian company's accounts-payable team, who need to match each OUTGOING payment to a vendor invoice.

Extract every line that represents money PAID OUT (debit/withdrawal) — ignore incoming credits/deposits entirely (those are money received, not paid).

For each outgoing payment line, extract:
- date: converted to ISO format YYYY-MM-DD if a year is present, otherwise your best guess with the current year
- amount: the debit amount only (numeric, no currency symbol or commas)
- reference: the UTR / reference number / transaction ID printed on that line, if any
- narration: the payee name / description text exactly as printed, trimmed

Return at most ${MAX_LINES} lines. If you cannot confidently identify amount for a line, skip it entirely — never invent a number. Always call the statement_extraction_result tool.`;

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "statement_extraction_result",
    description: "Return the list of outgoing payment lines found in the statement",
    parameters: {
      type: "object",
      properties: {
        payments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: ["string", "null"] },
              amount: { type: ["number", "string"] },
              reference: { type: ["string", "null"] },
              narration: { type: ["string", "null"] },
            },
            required: ["date", "amount", "reference", "narration"],
          },
        },
      },
      required: ["payments"],
    },
  },
};

interface ParsedPayment {
  date: string | null;
  amount: number;
  reference: string | null;
  narration: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callGroq(apiKey: string, model: string, userContent: unknown) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "statement_extraction_result" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Groq error:", response.status, text);
    return { ok: false as const, status: response.status };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    return { ok: false as const, status: 502 };
  }

  try {
    const raw = JSON.parse(toolCall.function.arguments);
    return { ok: true as const, payments: normalizePayments(raw.payments) };
  } catch (e) {
    console.error("Failed to parse tool arguments:", e);
    return { ok: false as const, status: 502 };
  }
}

function normalizePayments(list: unknown): ParsedPayment[] {
  return (Array.isArray(list) ? list : [])
    .map((p: any) => {
      const amount = typeof p.amount === "number" ? p.amount : parseFloat(String(p.amount ?? "").replace(/[^0-9.]/g, ""));
      return {
        date: typeof p.date === "string" && p.date ? p.date : null,
        amount: Number.isFinite(amount) ? amount : 0,
        reference: typeof p.reference === "string" && p.reference ? p.reference : null,
        narration: typeof p.narration === "string" && p.narration ? p.narration.trim() : null,
      };
    })
    .filter((p: ParsedPayment) => p.amount > 0)
    .slice(0, MAX_LINES);
}

// Fallback for when Groq is down, rate-limited, or over capacity (all
// confirmed to happen live during this sweep). Same extraction contract via
// Anthropic's tool_use, so callers don't need to know which provider answered.
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_TOOL = {
  name: "statement_extraction_result",
  description: EXTRACTION_TOOL.function.description,
  input_schema: EXTRACTION_TOOL.function.parameters,
};

async function callClaude(apiKey: string, userContent: unknown) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [ANTHROPIC_TOOL],
      tool_choice: { type: "tool", name: "statement_extraction_result" },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Claude error:", response.status, text);
    return { ok: false as const, status: response.status };
  }

  const data = await response.json();
  const toolUse = data.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse?.input) {
    return { ok: false as const, status: 502 };
  }
  return { ok: true as const, payments: normalizePayments(toolUse.input.payments) };
}

// Groq first (cheap, fast); Claude only if Groq fails for any reason
// (down, rate-limited, over capacity -- all confirmed to happen live).
async function callAI(
  groqKey: string | undefined,
  anthropicKey: string | undefined,
  groqModel: string,
  groqContent: unknown,
  claudeContent: unknown,
) {
  if (groqKey) {
    const result = await callGroq(groqKey, groqModel, groqContent);
    if (result.ok) return result;
    console.warn("Groq failed, falling back to Claude");
  }
  if (!anthropicKey) {
    return { ok: false as const, status: 500 };
  }
  return callClaude(anthropicKey, claudeContent);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!groqApiKey && !anthropicApiKey) {
      return jsonResponse({ success: false, error: "AI reader not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ success: false, error: "Not signed in" }, 401);
    }

    const { data: isStaff } = await admin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) {
      return jsonResponse({ success: false, error: "Only staff can use this" }, 403);
    }

    const body = await req.json();
    const pastedText: string | undefined = body.text;
    const fileBase64: string | undefined = body.file_base64;
    const mimeType: string | undefined = body.mime_type;

    let aiCall: Awaited<ReturnType<typeof callAI>>;

    if (pastedText && pastedText.trim()) {
      const textBlock = `Statement text:\n${pastedText.trim().slice(0, 30000)}`;
      aiCall = await callAI(groqApiKey, anthropicApiKey, TEXT_MODEL,
        [{ type: "text", text: textBlock }],
        [{ type: "text", text: textBlock }],
      );
    } else if (fileBase64 && mimeType) {
      if (mimeType === "application/pdf") {
        const binary = atob(fileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const pdf = await getDocumentProxy(bytes);
        const { text } = await extractText(pdf, { mergePages: true });
        const trimmed = (text || "").trim().slice(0, 30000);
        if (!trimmed) {
          return jsonResponse({
            success: false,
            error: "This PDF has no extractable text (looks like a scanned image). Try pasting the statement text instead.",
          }, 422);
        }
        const textBlock = `Statement text:\n${trimmed}`;
        aiCall = await callAI(groqApiKey, anthropicApiKey, TEXT_MODEL,
          [{ type: "text", text: textBlock }],
          [{ type: "text", text: textBlock }],
        );
      } else if (mimeType.startsWith("text/") || mimeType === "application/csv" || mimeType === "text/csv") {
        const binary = atob(fileBase64);
        const textBlock = `Statement text:\n${binary.slice(0, 30000)}`;
        aiCall = await callAI(groqApiKey, anthropicApiKey, TEXT_MODEL,
          [{ type: "text", text: textBlock }],
          [{ type: "text", text: textBlock }],
        );
      } else if (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png") {
        const dataUrl = `data:${mimeType};base64,${fileBase64}`;
        const instruction = "Read this bank statement image and extract the outgoing payment lines.";
        aiCall = await callAI(groqApiKey, anthropicApiKey, VISION_MODEL,
          [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
          [
            { type: "text", text: instruction },
            { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } },
          ],
        );
      } else {
        return jsonResponse({ success: false, error: "Unsupported file type. Use PDF, CSV, JPG or PNG, or paste the statement text." }, 400);
      }
    } else {
      return jsonResponse({ success: false, error: "Provide statement text or a file" }, 400);
    }

    if (!aiCall.ok) {
      const errorMsg = aiCall.status === 429
        ? "AI reader is busy right now, please try again shortly"
        : "Could not read this statement automatically, please check the format";
      return jsonResponse({ success: false, error: errorMsg }, aiCall.status === 429 ? 429 : 500);
    }

    return jsonResponse({ success: true, payments: aiCall.payments });
  } catch (error) {
    console.error("parse-bank-statement failed:", error);
    const message = error instanceof Error ? error.message : "Parsing failed";
    return jsonResponse({ success: false, error: message.slice(0, 300) }, 500);
  }
});
