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
    const list = Array.isArray(raw.payments) ? raw.payments : [];
    const payments: ParsedPayment[] = list
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
    return { ok: true as const, payments };
  } catch (e) {
    console.error("Failed to parse tool arguments:", e);
    return { ok: false as const, status: 502 };
  }
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

    const { data: isStaff } = await admin.rpc("is_internal_staff", { _user_id: user.id });
    if (!isStaff) {
      return jsonResponse({ success: false, error: "Only staff can use this" }, 403);
    }

    const body = await req.json();
    const pastedText: string | undefined = body.text;
    const fileBase64: string | undefined = body.file_base64;
    const mimeType: string | undefined = body.mime_type;

    let aiCall: Awaited<ReturnType<typeof callGroq>>;

    if (pastedText && pastedText.trim()) {
      aiCall = await callGroq(groqApiKey, TEXT_MODEL, [
        { type: "text", text: `Statement text:\n${pastedText.trim().slice(0, 30000)}` },
      ]);
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
        aiCall = await callGroq(groqApiKey, TEXT_MODEL, [{ type: "text", text: `Statement text:\n${trimmed}` }]);
      } else if (mimeType.startsWith("text/") || mimeType === "application/csv" || mimeType === "text/csv") {
        const binary = atob(fileBase64);
        aiCall = await callGroq(groqApiKey, TEXT_MODEL, [{ type: "text", text: `Statement text:\n${binary.slice(0, 30000)}` }]);
      } else if (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png") {
        const dataUrl = `data:${mimeType};base64,${fileBase64}`;
        aiCall = await callGroq(groqApiKey, VISION_MODEL, [
          { type: "text", text: "Read this bank statement image and extract the outgoing payment lines." },
          { type: "image_url", image_url: { url: dataUrl } },
        ]);
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
