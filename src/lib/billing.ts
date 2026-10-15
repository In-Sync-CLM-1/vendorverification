import type { Database } from "@/integrations/supabase/types";

/**
 * One row per piece of work, from the PI to the last credit note. The row is a
 * vendor_invoices record: it starts as a PI / Quotation, and the invoice takes
 * its place on the same row. Credit notes are their own rows linked to the
 * invoice they reduce.
 */
type InvoiceRow = Database["public"]["Tables"]["vendor_invoices"]["Row"];

export interface BillingPo {
  id: string;
  po_number: string;
  po_date: string;
  grand_total: number;
  pdf_file_key: string | null;
}

export interface BillingPayment {
  id: string;
  payment_date: string;
  advance_adjusted: number;
  gst_amount: number;
  tds_amount: number;
  payout_amount: number;
  total_settled: number | null;
  utr_reference: string | null;
  remarks: string | null;
  is_full_settlement: boolean;
}

export interface BillingCreditNote {
  id: string;
  credit_for_invoice_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  description: string | null;
  invoice_file_key: string | null;
  created_at: string;
}

export type BillingRow = InvoiceRow & {
  vendors: { company_name: string; vendor_code: string | null } | null;
  purchase_orders: BillingPo[] | null;
  vendor_invoice_payments: BillingPayment[] | null;
  credit_notes: BillingCreditNote[];
};

export const PI_STAGES = ["proforma_invoice", "quotation"] as const;
export const isPiStage = (r: Pick<InvoiceRow, "doc_stage">) => r.doc_stage === "proforma_invoice" || r.doc_stage === "quotation";
export const isInvoice = (r: Pick<InvoiceRow, "doc_stage">) => r.doc_stage === "invoice";

export const poOf = (r: BillingRow): BillingPo | null => r.purchase_orders?.[0] ?? null;
export const paymentsOf = (r: BillingRow): BillingPayment[] => r.vendor_invoice_payments ?? [];

const num = (v: number | string | null | undefined) => Number(v ?? 0);

export const cnTotal = (r: BillingRow) => r.credit_notes.reduce((s, c) => s + num(c.invoice_amount), 0);
export const paidOut = (r: BillingRow) => paymentsOf(r).reduce((s, p) => s + num(p.payout_amount), 0);
export const tdsTotal = (r: BillingRow) => paymentsOf(r).reduce((s, p) => s + num(p.tds_amount), 0);
export const legacyAdvanceAdjusted = (r: BillingRow) => paymentsOf(r).reduce((s, p) => s + num(p.advance_adjusted), 0);
export const advPaid = (r: BillingRow) => (r.adv_status === "paid" ? num(r.adv_paid_amount) : 0);

/** Everything counted against the invoice: payments, TDS, advances, and the row's own advance. */
export const settledTotal = (r: BillingRow) => paymentsOf(r).reduce((s, p) => s + num(p.total_settled), 0) + advPaid(r);
export const netPayable = (r: BillingRow) => (isInvoice(r) ? num(r.invoice_amount) - cnTotal(r) : 0);
export const balanceOf = (r: BillingRow) => (isInvoice(r) ? Math.max(netPayable(r) - settledTotal(r), 0) : null);

export type RowStage = "awaiting_owner" | "awaiting_accounts" | "waiting" | "approved" | "rejected" | "submitted" | "part" | "paid";

export function stageOf(r: BillingRow): RowStage {
  if (isInvoice(r)) {
    if (r.status === "paid") return "paid";
    if (r.status === "partially_paid") return "part";
    if (r.status === "rejected") return "rejected";
    return "submitted";
  }
  if (r.pi_approval_stage === "awaiting_owner") return "awaiting_owner";
  if (r.pi_approval_stage === "awaiting_accounts") return "awaiting_accounts";
  if (r.status === "approved") return "approved";
  if (r.status === "rejected") return "rejected";
  return "waiting";
}

export const STAGE_LABEL: Record<RowStage, string> = {
  awaiting_owner: "Awaiting owner",
  awaiting_accounts: "Awaiting Accounts",
  waiting: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  submitted: "Submitted",
  part: "Part paid",
  paid: "Paid",
};

export const STAGE_TONE: Record<RowStage, string> = {
  awaiting_owner: "bg-amber-100 text-amber-800 border-amber-200",
  awaiting_accounts: "bg-violet-100 text-violet-800 border-violet-200",
  waiting: "bg-slate-100 text-slate-700 border-slate-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  submitted: "bg-sky-100 text-sky-800 border-sky-200",
  part: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const docKindLabel = (r: BillingRow) =>
  isInvoice(r) ? "Invoice" : r.doc_stage === "quotation" ? "Quotation" : "PI";

export const docNumber = (r: BillingRow) =>
  isInvoice(r) ? r.invoice_number : r.pi_document_number;

export const docAmount = (r: BillingRow) =>
  isInvoice(r) ? num(r.invoice_amount) : r.pi_amount == null ? null : num(r.pi_amount);

export const docDate = (r: BillingRow) => (isInvoice(r) ? r.invoice_date : r.pi_document_date) || r.created_at;
export const docFileKey = (r: BillingRow) => (isInvoice(r) ? r.invoice_file_key : r.pi_file_key);

/** The five-step journey shown under the status: PI, PO, Advance, Invoice, Paid. */
export function journeyOf(r: BillingRow): { key: string; label: string; state: "done" | "todo" | "skip" }[] {
  const s = stageOf(r);
  return [
    { key: "pi", label: "PI", state: "done" },
    { key: "po", label: "PO", state: poOf(r) ? "done" : "todo" },
    { key: "adv", label: "Advance", state: !r.adv_status ? "skip" : r.adv_status === "paid" ? "done" : "todo" },
    { key: "inv", label: "Invoice", state: isInvoice(r) ? "done" : "todo" },
    { key: "paid", label: "Paid", state: s === "paid" ? "done" : "todo" },
  ];
}

export interface Viewer {
  mode: "vendor" | "staff";
  userId: string | null;
  isAdmin: boolean;
  isAccounts: boolean;
  isViewOnly: boolean;
}

export type NextAction =
  | { kind: "decide" }
  | { kind: "issue_po" }
  | { kind: "record_advance" }
  | { kind: "record_payment" }
  | { kind: "resubmit" }
  | { kind: "upload_invoice"; canAdvance: boolean }
  | { kind: "raise_credit_note" }
  | { kind: "wait"; text: string }
  | { kind: "none" };

/** The one thing this person can do on this row, or who it is waiting for. */
export function nextActionFor(r: BillingRow, v: Viewer): NextAction {
  const po = poOf(r);
  const owner = r.project_owner_name || "the project owner";

  if (v.mode === "vendor") {
    if (isInvoice(r)) return { kind: "raise_credit_note" };
    if (r.pi_approval_stage === "awaiting_accounts") return { kind: "wait", text: "Waiting for Accounts approval" };
    if (r.pi_approval_stage === "awaiting_owner") return { kind: "wait", text: `Waiting for ${owner}` };
    if (r.status === "rejected") return { kind: "resubmit" };
    if (!po) return { kind: "wait", text: "Waiting for the PO" };
    return { kind: "upload_invoice", canAdvance: !r.adv_status };
  }

  // What a person can do follows their function, not their account type: the
  // project owner decides a PI routed to them even on a read-only account.
  if (isPiStage(r) && r.pi_approval_stage === "awaiting_owner" && !!v.userId && r.project_owner_user_id === v.userId) {
    return { kind: "decide" };
  }

  if (v.isViewOnly) return { kind: "none" };

  if (isPiStage(r)) {
    // One decision per stage: the project owner first, then Accounts.
    if (r.pi_approval_stage === "awaiting_accounts") {
      return v.isAccounts || v.isAdmin ? { kind: "decide" } : { kind: "wait", text: "Waiting for Accounts approval" };
    }
    if (r.pi_approval_stage === "awaiting_owner") {
      return r.project_owner_user_id === v.userId || v.isAdmin
        ? { kind: "decide" }
        : { kind: "wait", text: `Waiting for ${owner}` };
    }
    if (r.status === "rejected") return { kind: "wait", text: "Waiting for vendor" };
    if (!po) return v.isAccounts ? { kind: "issue_po" } : { kind: "wait", text: "Waiting for Accounts" };
    if (r.adv_status === "requested") return v.isAccounts ? { kind: "record_advance" } : { kind: "wait", text: "Waiting for Accounts" };
    return { kind: "wait", text: "Waiting for invoice" };
  }

  if (isInvoice(r)) {
    if (r.adv_status === "requested" && v.isAccounts) return { kind: "record_advance" };
    if (r.status !== "paid" && r.status !== "rejected") {
      return v.isAccounts ? { kind: "record_payment" } : { kind: "wait", text: "Waiting for Accounts" };
    }
  }
  return { kind: "none" };
}

/** Counts used by the filter chips. */
export const CHIPS_VENDOR = [
  { key: "all", label: "All", test: (_r: BillingRow) => true },
  { key: "pi", label: "PI", test: (r: BillingRow) => isPiStage(r) },
  { key: "po", label: "With PO", test: (r: BillingRow) => isPiStage(r) && !!poOf(r) },
  { key: "inv", label: "Invoiced", test: (r: BillingRow) => isInvoice(r) && stageOf(r) !== "paid" },
  { key: "paid", label: "Paid", test: (r: BillingRow) => stageOf(r) === "paid" },
];

export const chipsStaff = (v: Viewer) => [
  { key: "all", label: "All", test: (_r: BillingRow) => true },
  { key: "decide", label: "PI to decide", test: (r: BillingRow) => nextActionFor(r, v).kind === "decide" },
  { key: "issue", label: "PO to issue", test: (r: BillingRow) => isPiStage(r) && r.status === "approved" && !poOf(r) },
  { key: "pay", label: "To pay", test: (r: BillingRow) => (isInvoice(r) && stageOf(r) !== "paid" && stageOf(r) !== "rejected") || r.adv_status === "requested" },
  { key: "paid", label: "Paid", test: (r: BillingRow) => stageOf(r) === "paid" },
];
