import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/invoices";
import {
  BillingRow,
  CHIPS_VENDOR,
  STAGE_LABEL,
  STAGE_TONE,
  Viewer,
  advPaid,
  balanceOf,
  chipsStaff,
  cnTotal,
  docAmount,
  docDate,
  docFileKey,
  docKindLabel,
  docNumber,
  isInvoice,
  journeyOf,
  legacyAdvanceAdjusted,
  netPayable,
  nextActionFor,
  paidOut,
  paymentsOf,
  poOf,
  stageOf,
  tdsTotal,
} from "@/lib/billing";
import { FileActions } from "./FileActions";

export interface BillingActions {
  resubmit: (r: BillingRow) => void;
  requestAdvance: (r: BillingRow) => void;
  uploadInvoice: (r: BillingRow) => void;
  raiseCreditNote: (r: BillingRow) => void;
  decide: (r: BillingRow) => void;
  issuePo: (r: BillingRow) => void;
  recordAdvance: (r: BillingRow) => void;
  recordPayment: (r: BillingRow) => void;
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

const BTN = {
  decide: "bg-emerald-700 text-white hover:bg-emerald-800",
  resubmit: "bg-amber-700 text-white hover:bg-amber-800",
  upload: "bg-primary text-primary-foreground hover:bg-primary/90",
  advance: "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100",
  creditNote: "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100",
  issuePo: "bg-teal-700 text-white hover:bg-teal-800",
  recordAdvance: "bg-indigo-700 text-white hover:bg-indigo-800",
  recordPayment: "bg-[#1E3A5F] text-white hover:bg-[#17304f]",
};

const JOURNEY_COLOR: Record<string, string> = {
  pi: "#0066B3",
  po: "#0F766E",
  adv: "#4338CA",
  inv: "#1E3A5F",
  paid: "#17733E",
};

function JourneyTrack({ row }: { row: BillingRow }) {
  const steps = journeyOf(row);
  const label = steps.map((s) => `${s.label} ${s.state === "done" ? "done" : s.state === "skip" ? "skipped" : "to do"}`).join(", ");
  return (
    <div className="mt-1.5 flex items-center" role="img" aria-label={`Progress: ${label}`} title={label}>
      {steps.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && <span className="h-0.5 w-3" style={{ background: s.state === "done" ? JOURNEY_COLOR[s.key] : "#E2E8F0" }} />}
          <span
            className="h-2.5 w-2.5 rounded-full border-2"
            style={{
              borderColor: s.state === "done" ? JOURNEY_COLOR[s.key] : "#CBD5E1",
              background: s.state === "done" ? JOURNEY_COLOR[s.key] : "#fff",
              borderStyle: s.state === "skip" ? "dashed" : "solid",
            }}
          />
        </Fragment>
      ))}
      {row.credit_notes.length > 0 && <span className="ml-3 h-2 w-2 rotate-45 bg-violet-600" title="Credit note raised" />}
    </div>
  );
}

function RowDetail({ row, staff }: { row: BillingRow; staff: boolean }) {
  const po = poOf(row);
  const payments = paymentsOf(row);
  return (
    <div className="grid gap-6 p-4 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</h4>
        <div className="divide-y text-sm">
          {!isInvoice(row) && (
            <div className="flex items-center justify-between py-1.5">
              <span><span className="mr-2 rounded border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{docKindLabel(row)}</span>{docNumber(row) || "—"}</span>
              <FileActions fileKey={docFileKey(row)} label={`${docKindLabel(row)} ${docNumber(row) || ""}`} downloadName={`${docKindLabel(row)}-${docNumber(row) || row.id.slice(0, 6)}`} />
            </div>
          )}
          {po && (
            <div className="flex items-center justify-between py-1.5">
              <span><span className="mr-2 rounded border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">PO</span>{po.po_number} · {formatINR(po.grand_total)}</span>
              <FileActions fileKey={po.pdf_file_key} label={`PO ${po.po_number}`} downloadName={`PO-${po.po_number}`} />
            </div>
          )}
          {row.adv_status && (
            <div className="flex items-center justify-between py-1.5">
              <span><span className="mr-2 rounded border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Advance</span>{formatINR(row.adv_amount)} · {row.adv_reason}</span>
              <span className="text-xs text-muted-foreground">{row.adv_status === "paid" ? `Paid ${fmtDate(row.adv_paid_on)}${row.adv_utr ? ` · ${row.adv_utr}` : ""}` : "Requested"}</span>
            </div>
          )}
          {isInvoice(row) && (
            <div className="flex items-center justify-between py-1.5">
              <span><span className="mr-2 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">Invoice</span>{row.invoice_number} · {formatINR(row.invoice_amount)}</span>
              <FileActions fileKey={row.invoice_file_key} label={`invoice ${row.invoice_number}`} downloadName={`Invoice-${row.invoice_number}`} />
            </div>
          )}
          {row.credit_notes.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5">
              <span><span className="mr-2 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800">Credit note</span>{c.invoice_number} · −{formatINR(c.invoice_amount)}{c.description ? ` · ${c.description}` : ""}</span>
              <FileActions fileKey={c.invoice_file_key} label={`credit note ${c.invoice_number}`} downloadName={`CreditNote-${c.invoice_number}`} />
            </div>
          ))}
        </div>
        {!isInvoice(row) && row.status === "rejected" && row.pi_review_comments && (
          <p className="mt-2 text-sm text-destructive">Rejected: “{row.pi_review_comments}”</p>
        )}
        {row.pi_vendor_remarks && !isInvoice(row) && <p className="mt-2 text-xs text-muted-foreground">Vendor remarks: {row.pi_vendor_remarks}</p>}
        {staff && <p className="mt-2 text-xs text-muted-foreground">Project owner: {row.project_owner_name || "—"}</p>}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money</h4>
        {!isInvoice(row) ? (
          <p className="text-sm text-muted-foreground">No invoice yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
              <span>Invoice</span><span className="text-right">{formatINR(row.invoice_amount)}</span>
              {cnTotal(row) > 0 && (<><span>Credit notes</span><span className="text-right">−{formatINR(cnTotal(row))}</span></>)}
              <span className="border-t pt-1 font-semibold">Net payable</span><span className="border-t pt-1 text-right font-semibold">{formatINR(netPayable(row))}</span>
              {advPaid(row) > 0 && (<><span>Advance paid</span><span className="text-right">−{formatINR(advPaid(row))}</span></>)}
              {legacyAdvanceAdjusted(row) > 0 && (<><span>Advance adjusted</span><span className="text-right">−{formatINR(legacyAdvanceAdjusted(row))}</span></>)}
              {tdsTotal(row) > 0 && (<><span>TDS deducted</span><span className="text-right">−{formatINR(tdsTotal(row))}</span></>)}
              <span>Paid out</span><span className="text-right">−{formatINR(paidOut(row))}</span>
              <span className="border-t pt-1 font-semibold">Balance</span><span className="border-t pt-1 text-right font-semibold">{formatINR(balanceOf(row))}</span>
            </div>
            {payments.length > 0 && (
              <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                {payments.map((p) => (
                  <li key={p.id}>
                    {fmtDate(p.payment_date)} · paid {formatINR(p.payout_amount)} + TDS {formatINR(p.tds_amount)}
                    {Number(p.advance_adjusted) > 0 ? ` + advance ${formatINR(p.advance_adjusted)}` : ""}
                    {p.utr_reference ? ` · ${p.utr_reference}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function BillingTable({
  rows,
  viewer,
  actions,
  loading,
  emptyTitle,
  emptyHint,
}: {
  rows: BillingRow[];
  viewer: Viewer;
  actions: BillingActions;
  loading?: boolean;
  emptyTitle: string;
  emptyHint?: string;
}) {
  const staff = viewer.mode === "staff";
  const [chip, setChip] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const chips = useMemo(() => (staff ? chipsStaff(viewer) : CHIPS_VENDOR), [staff, viewer]);
  const search = q.trim().toLowerCase();
  const matches = (r: BillingRow) =>
    !search ||
    [r.vendors?.company_name, r.project_number, r.project_name, docNumber(r), r.pi_document_number, r.invoice_number, poOf(r)?.po_number]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  const searched = rows.filter(matches);
  const active = chips.find((c) => c.key === chip) ?? chips[0];
  const shown = searched.filter(active.test);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cols = ["Project", ...(staff ? ["Vendor"] : []), "PI → Invoice", "Status", "PO", "Advance", "Credit notes", "Settled", "Balance", "Next step"];

  const renderNext = (r: BillingRow) => {
    const a = nextActionFor(r, viewer);
    const b = (cls: string, label: string, fn: () => void, soft = false) => (
      <Button size="sm" variant={soft ? "outline" : "default"} className={`h-7 text-xs ${cls}`} onClick={(e) => { e.stopPropagation(); fn(); }}>
        {label}
      </Button>
    );
    switch (a.kind) {
      case "decide": return b(BTN.decide, "Approve or reject", () => actions.decide(r));
      case "issue_po": return b(BTN.issuePo, "Issue PO", () => actions.issuePo(r));
      case "record_advance": return b(BTN.recordAdvance, "Record advance payment", () => actions.recordAdvance(r));
      case "record_payment": return b(BTN.recordPayment, "Record payment", () => actions.recordPayment(r));
      case "resubmit": return b(BTN.resubmit, "Fix and resubmit", () => actions.resubmit(r));
      case "raise_credit_note": return b(BTN.creditNote, "Raise credit note", () => actions.raiseCreditNote(r), true);
      case "upload_invoice":
        return (
          <div className="flex flex-wrap gap-1.5">
            {b(BTN.upload, "Upload invoice", () => actions.uploadInvoice(r))}
            {a.canAdvance && b(BTN.advance, "Request advance", () => actions.requestAdvance(r), true)}
          </div>
        );
      case "wait": return <span className="text-xs text-muted-foreground">{a.text}</span>;
      default: return <span className="text-muted-foreground">—</span>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const n = searched.filter(c.test).length;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setChip(c.key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${chip === c.key ? "border-sky-200 bg-secondary font-semibold text-secondary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                {c.label} · {n}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, project or number" className="pl-8" aria-label="Search billing rows" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : shown.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium">{rows.length === 0 ? emptyTitle : "Nothing matches"}</p>
            {rows.length === 0 && emptyHint && <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {cols.map((c) => (<TableHead key={c} className="whitespace-nowrap">{c}</TableHead>))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => {
                  const st = stageOf(r);
                  const po = poOf(r);
                  const isOpen = open.has(r.id);
                  const amount = docAmount(r);
                  return (
                    <Fragment key={r.id}>
                      <TableRow className="cursor-pointer align-top hover:bg-sky-50/40" onClick={() => toggle(r.id)}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-start gap-1.5">
                            <ChevronDown className={`mt-0.5 h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                            <div>
                              <p className="font-semibold">{r.project_number || "—"}</p>
                              <p className="max-w-[160px] truncate text-xs text-muted-foreground">{r.project_name}</p>
                            </div>
                          </div>
                        </TableCell>
                        {staff && <TableCell className="min-w-[150px]">{r.vendors?.company_name}<p className="text-xs text-muted-foreground">{r.vendors?.vendor_code}</p></TableCell>}
                        <TableCell className="min-w-[210px]">
                          <span className={`mr-1.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${isInvoice(r) ? "border-sky-200 bg-sky-50 text-sky-800" : "text-muted-foreground"}`}>{docKindLabel(r)}</span>
                          <b className="whitespace-nowrap">{docNumber(r) || "—"}</b>
                          <span className="ml-1.5 whitespace-nowrap"><FileActions fileKey={docFileKey(r)} label={`${docKindLabel(r)} ${docNumber(r) || ""}`} downloadName={`${docKindLabel(r)}-${docNumber(r) || r.id.slice(0, 6)}`} /></span>
                          <p className="text-xs text-muted-foreground">{fmtDate(docDate(r))} · {amount == null ? "Amount not read" : formatINR(amount)}</p>
                          {!isInvoice(r) && r.status === "rejected" && r.pi_review_comments && (
                            <p className="mt-0.5 max-w-[220px] text-xs text-destructive">“{r.pi_review_comments}”</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STAGE_TONE[st]}>{STAGE_LABEL[st]}</Badge>
                          <JourneyTrack row={r} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {po ? (
                            <>
                              <b>{po.po_number}</b>
                              <span className="ml-1.5"><FileActions fileKey={po.pdf_file_key} label={`PO ${po.po_number}`} downloadName={`PO-${po.po_number}`} /></span>
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.adv_status ? (<><b className="tabular-nums">{formatINR(r.adv_amount)}</b><p className="text-xs text-muted-foreground">{r.adv_status === "paid" ? `Paid ${fmtDate(r.adv_paid_on)}` : "Requested"}</p></>) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.credit_notes.length > 0 ? (
                            <>
                              <b className="tabular-nums">−{formatINR(cnTotal(r))}</b>
                              {r.credit_notes.map((c) => (
                                <p key={c.id} className="text-xs text-muted-foreground">
                                  {c.invoice_number}
                                  <span className="ml-1.5"><FileActions fileKey={c.invoice_file_key} label={`credit note ${c.invoice_number}`} downloadName={`CreditNote-${c.invoice_number}`} /></span>
                                </p>
                              ))}
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isInvoice(r) || advPaid(r) > 0 ? (
                            <>
                              <b className="tabular-nums">{formatINR(isInvoice(r) ? paidOut(r) : advPaid(r))}</b>
                              <p className="text-xs text-muted-foreground">
                                {[tdsTotal(r) > 0 ? `TDS ${formatINR(tdsTotal(r))}` : "", isInvoice(r) && advPaid(r) > 0 ? `Advance ${formatINR(advPaid(r))}` : "", !isInvoice(r) ? "Advance" : ""].filter(Boolean).join(" · ") || " "}
                              </p>
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold tabular-nums">{isInvoice(r) ? formatINR(balanceOf(r)) : <span className="font-normal text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{renderNext(r)}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={cols.length} className="p-0"><div className="sticky left-0 w-[min(100%,980px)]"><RowDetail row={r} staff={staff} /></div></TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

