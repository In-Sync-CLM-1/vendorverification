import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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
// Tally ledger exports are read column-by-column in code (reliable, no
// row-count ceiling) rather than through the AI, so this cap is generous —
// a full financial year's bank book runs into the hundreds of Payment
// vouchers, well past what an AI extraction call could return anyway.
const TALLY_MAX_LINES = 2000;

const SYSTEM_PROMPT = `You are reading a bank account statement (or a pasted list of payment references) for an Indian company's accounts-payable team, who need to match each OUTGOING payment to a vendor invoice.

Extract every line that represents money PAID OUT (debit/withdrawal) — ignore incoming credits/deposits entirely (those are money received, not paid).

For each outgoing payment line, extract:
- date: converted to ISO format YYYY-MM-DD if a year is present, otherwise your best guess with the current year
- amount: the debit amount only (numeric, no currency symbol or commas)
- reference: the UTR / reference number / transaction ID printed on that line, if any
- narration: the payee name / description text exactly as printed, trimmed

Some statements are instead exported from Tally (an Indian accounting system) as a ledger "Book": columns Date, Particulars, Vch Type, Vch No., Debit, Credit. In a Tally bank-ledger export a "Payment" voucher (money paid out) has its amount in the CREDIT column, not Debit — the opposite of a normal bank download — so decide direction from the Vch Type column, never from column position. Ignore "Receipt" vouchers (money in). When Particulars reads "(as per details)", the real payee names and their individual amounts are listed on the rows directly below (each with its own Debit-column figure) — extract each of those as its own separate payment line, not one combined line.

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

// Tally exports its bank ledger "Book" as a fixed table: Date, Particulars
// (Dr/Cr marker + name split across two cells), Vch Type, Vch No., Debit,
// Credit. This layout is machine-generated and rigid, so it's read directly
// rather than through the AI — deterministic, handles a full year's worth of
// vouchers (hundreds of rows) with no token/output-length ceiling, and can't
// hallucinate an amount. AI is only used as a fallback if a sheet doesn't
// match this expected shape (see xlsx handling below).
interface TallyHeader {
  rowIndex: number;
  dateCol: number;
  vchTypeCol: number;
  vchNoCol: number;
  debitCol: number;
  creditCol: number;
}

function findTallyHeader(rows: unknown[][]): TallyHeader | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row) continue;
    const norm = row.map((c) => (typeof c === "string" ? c.trim().toLowerCase() : null));
    const dateCol = norm.findIndex((c) => c === "date");
    const vchTypeCol = norm.findIndex((c) => c === "vch type");
    const debitCol = norm.findIndex((c) => c === "debit");
    const creditCol = norm.findIndex((c) => c === "credit");
    if (dateCol !== -1 && vchTypeCol !== -1 && debitCol !== -1 && creditCol !== -1) {
      const vchNoCol = norm.findIndex((c) => c != null && c.startsWith("vch no"));
      return { rowIndex: i, dateCol, vchTypeCol, vchNoCol: vchNoCol === -1 ? vchTypeCol + 1 : vchNoCol, debitCol, creditCol };
    }
  }
  return null;
}

function tallyDateToISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return null;
}

function tallyNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// The Particulars text sits between the Date and Vch Type columns, offset by
// one cell from a Dr/Cr marker cell -- pick the first non-empty string in
// that range that isn't the marker itself, so exact column offsets don't
// need to be hardcoded.
function tallyParticulars(row: unknown[], dateCol: number, vchTypeCol: number): string | null {
  for (let c = dateCol + 1; c < vchTypeCol; c++) {
    const v = row[c];
    if (typeof v === "string") {
      const t = v.trim();
      if (t && t !== "Dr" && t !== "Cr") return t;
    }
  }
  return null;
}

function extractTallyPayments(rows: unknown[][], header: TallyHeader): ParsedPayment[] {
  const { rowIndex, dateCol, vchTypeCol, vchNoCol, debitCol, creditCol } = header;
  const out: ParsedPayment[] = [];
  let currentDate: string | null = null;
  let currentVchNo: string | null = null;
  let currentIsPayment = false;
  let currentIsBreakup = false;

  for (let i = rowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rowDate = tallyDateToISO(row[dateCol]);
    const isNewVoucher = rowDate !== null;
    const particulars = tallyParticulars(row, dateCol, vchTypeCol);

    if (isNewVoucher) {
      const vchTypeCell = row[vchTypeCol];
      const vchNoCell = row[vchNoCol];
      currentDate = rowDate;
      currentVchNo = typeof vchNoCell === "string" ? vchNoCell.trim() : (vchNoCell != null ? String(vchNoCell).trim() : null);
      currentIsPayment = typeof vchTypeCell === "string" && vchTypeCell.trim() === "Payment";
      currentIsBreakup = currentIsPayment && (particulars || "").toLowerCase().trim() === "(as per details)";

      if (currentIsPayment && !currentIsBreakup) {
        const credit = tallyNum(row[creditCol]);
        if (credit && credit > 0) {
          out.push({ date: currentDate, amount: credit, reference: currentVchNo, narration: particulars });
        }
      }
    } else if (currentIsPayment && currentIsBreakup) {
      // Sub-row under a multi-party payment voucher (e.g. a payroll run) --
      // its own debit-column figure is that one payee's share of the total.
      const debit = tallyNum(row[debitCol]);
      if (debit && debit > 0 && particulars) {
        out.push({ date: currentDate, amount: debit, reference: currentVchNo, narration: particulars });
      }
    }
  }

  return out.slice(0, TALLY_MAX_LINES);
}

function xlsxSheetsToRows(bytes: Uint8Array): { sheetName: string; rows: unknown[][] }[] {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null }) as unknown[][],
  }));
}

function xlsxSheetsToCsvText(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  return workbook.SheetNames
    .map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`)
    .join("\n\n");
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
    const fileName: string | undefined = body.file_name;

    let aiCall: Awaited<ReturnType<typeof callAI>>;

    const isXlsx = !!fileBase64 && (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      /\.xlsx$|\.xls$/i.test(fileName || "")
    );

    if (isXlsx) {
      const binary = atob(fileBase64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      let tallyPayments: ParsedPayment[] = [];
      try {
        const sheets = xlsxSheetsToRows(bytes);
        for (const { rows } of sheets) {
          const header = findTallyHeader(rows);
          if (header) tallyPayments = tallyPayments.concat(extractTallyPayments(rows, header));
        }
      } catch (e) {
        console.error("xlsx parse failed:", e);
      }

      if (tallyPayments.length > 0) {
        return jsonResponse({ success: true, payments: tallyPayments.slice(0, TALLY_MAX_LINES) });
      }

      // Doesn't match Tally's ledger layout (or came back empty) -- fall back
      // to reading it as generic tabular text through the AI, same as a CSV.
      let csvText = "";
      try {
        csvText = xlsxSheetsToCsvText(bytes);
      } catch (e) {
        return jsonResponse({ success: false, error: "Could not read this spreadsheet" }, 422);
      }
      const trimmed = csvText.trim().slice(0, 30000);
      if (!trimmed) {
        return jsonResponse({ success: false, error: "This spreadsheet appears to be empty" }, 422);
      }
      const textBlock = `Statement text:\n${trimmed}`;
      aiCall = await callAI(groqApiKey, anthropicApiKey, TEXT_MODEL,
        [{ type: "text", text: textBlock }],
        [{ type: "text", text: textBlock }],
      );
    } else if (pastedText && pastedText.trim()) {
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
