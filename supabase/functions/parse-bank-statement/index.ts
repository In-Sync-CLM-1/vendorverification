import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Raw bank-statement reading (pasted text / PDF / CSV / image, all routed
// through an AI extractor) is decommissioned -- it had no way to tell a
// bank transaction had already been matched and recorded, so the same
// transaction could get re-matched to a different invoice in a later
// session and recorded a second time at its FULL amount against BOTH
// invoices (found live 2026-09-25: A.V.MOVIES/Meet & Greet Entertainment/
// Natural Entertainers/Silvercrest all had this). Tally ledger exports are
// kept -- read deterministically column-by-column below, never through the
// AI, so this class of bug can't happen on that path.
const TALLY_MAX_LINES = 2000;

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

// Tally exports its bank ledger "Book" as a fixed table: Date, Particulars
// (Dr/Cr marker + name split across two cells), Vch Type, Vch No., Debit,
// Credit. This layout is machine-generated and rigid, so it's read directly
// rather than through an AI -- deterministic, handles a full year's worth of
// vouchers (hundreds of rows) with no token/output-length ceiling, and can't
// hallucinate an amount.
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
    const fileBase64: string | undefined = body.file_base64;
    const mimeType: string | undefined = body.mime_type;
    const fileName: string | undefined = body.file_name;

    const isXlsx = !!fileBase64 && (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      /\.xlsx$|\.xls$/i.test(fileName || "")
    );

    if (!isXlsx) {
      return jsonResponse({ success: false, error: "Upload a Tally-exported bank ledger (.xlsx) — other formats are no longer accepted." }, 400);
    }

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
      return jsonResponse({ success: false, error: "Could not read this spreadsheet" }, 422);
    }

    if (tallyPayments.length === 0) {
      return jsonResponse({
        success: false,
        error: "This doesn't look like a Tally bank-ledger export (expected Date / Particulars / Vch Type / Vch No. / Debit / Credit columns).",
      }, 422);
    }

    return jsonResponse({ success: true, payments: tallyPayments.slice(0, TALLY_MAX_LINES) });
  } catch (error) {
    console.error("parse-bank-statement failed:", error);
    const message = error instanceof Error ? error.message : "Parsing failed";
    return jsonResponse({ success: false, error: message.slice(0, 300) }, 500);
  }
});
