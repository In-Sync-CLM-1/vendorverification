import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadInvoiceFile, analyzeInvoiceFile, formatINR } from "@/lib/invoices";
import { Loader2, Sparkles } from "lucide-react";
import { FileActions } from "../FileActions";
import { BillingRow, balanceOf, cnTotal, docFileKey, docKindLabel, docNumber, poOf } from "@/lib/billing";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BillingRow | null;
  onDone: (info?: { approved?: boolean; final?: boolean }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Vendor asks for an advance against the PO. */
export function RequestAdvanceDialog({ open, onOpenChange, row, onDone }: BaseProps) {
  const po = row ? poOf(row) : null;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setAmount(""); setReason(""); } }, [open]);

  const send = async () => {
    if (!row || !po) return;
    const a = parseFloat(amount);
    if (!a || a <= 0) return toast.error("Enter the advance amount");
    if (a > Number(po.grand_total) + 1) return toast.error(`The advance cannot be more than the PO amount (${formatINR(po.grand_total)})`);
    if (!reason.trim()) return toast.error("Say what the advance is for");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("request_advance", { p_id: row.id, p_amount: a, p_reason: reason.trim() });
      if (error) throw new Error(error.message);
      toast.success("Advance requested. Accounts has been told");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request advance</DialogTitle>
          <DialogDescription>Against PO {po?.po_number} · {formatINR(po?.grand_total)}. The advance is taken off when your invoice is paid. One advance per PO.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="adv-amt">Advance amount *</Label><Input id="adv-amt" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Up to ${po ? formatINR(po.grand_total) : ""}`} /></div>
          <div className="space-y-1.5"><Label htmlFor="adv-why">What is it for? *</Label><Input id="adv-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. material purchase" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-indigo-700 text-white hover:bg-indigo-800" onClick={send} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Accounts records the advance payment. */
export function RecordAdvancePaymentDialog({ open, onOpenChange, row, onDone }: BaseProps) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && row) { setDate(today()); setAmount(String(row.adv_amount ?? "")); setUtr(""); } }, [open, row]);

  const save = async () => {
    if (!row) return;
    const a = parseFloat(amount);
    if (!a || a <= 0) return toast.error("Enter the amount paid");
    if (!utr.trim()) return toast.error("Enter the bank reference");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("record_advance_payment", { p_id: row.id, p_paid_on: date, p_amount: a, p_utr: utr.trim() });
      if (error) throw new Error(error.message);
      toast.success("Advance payment recorded. It will be taken off the invoice");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record advance payment</DialogTitle>
          <DialogDescription>{row?.vendors?.company_name} · asked for {formatINR(row?.adv_amount)} — “{row?.adv_reason}”</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="ap-date">Payment date</Label><Input id="ap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ap-amt">Amount paid</Label><Input id="ap-amt" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label htmlFor="ap-utr">Bank reference (UTR) *</Label><Input id="ap-utr" value={utr} onChange={(e) => setUtr(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-indigo-700 text-white hover:bg-indigo-800" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record advance payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Vendor raises a credit note against an invoice. */
export function RaiseCreditNoteDialog({ open, onOpenChange, row, onDone }: BaseProps) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [read, setRead] = useState(false);
  useEffect(() => { if (open) { setNumber(""); setDate(today()); setAmount(""); setReason(""); setFileKey(null); setRead(false); } }, [open]);

  const open_ = row ? Math.max((balanceOf(row) ?? 0), 0) : 0;
  const room = row ? Number(row.invoice_amount || 0) - cnTotal(row) : 0;
  const amt = parseFloat(amount) || 0;
  const dueBack = Math.max(amt - open_, 0);

  const onFile = async (file: File | null) => {
    setFileKey(null); setRead(false);
    if (!file) return;
    setParsing(true);
    try {
      const key = await uploadInvoiceFile(file, row?.vendor_id);
      setFileKey(key);
      try {
        const r = await analyzeInvoiceFile(key);
        if (r.invoice_number) setNumber(r.invoice_number);
        if (r.invoice_date) setDate(r.invoice_date);
        if (r.invoice_amount != null) setAmount(String(r.invoice_amount));
        setRead(true);
      } catch { /* fill in by hand */ }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!row) return;
    if (!fileKey) return toast.error("Attach the credit note file");
    if (!number.trim()) return toast.error("Enter the credit note number");
    if (!amt || amt <= 0) return toast.error("Enter the credit note amount");
    if (amt > room + 0.5) return toast.error(`A credit note cannot be more than ${formatINR(room)}, the part of the invoice not yet credited`);
    if (!reason.trim()) return toast.error("Say why the credit note is being raised");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("raise_credit_note", { p_invoice_id: row.id, p_number: number.trim(), p_date: date, p_amount: amt, p_reason: reason.trim(), p_file_key: fileKey });
      if (error) {
        if (error.code === "23505") throw new Error("A document with this number already exists");
        throw new Error(error.message);
      }
      toast.success("Credit note raised. The balance is updated");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not raise the credit note");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || parsing;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raise credit note</DialogTitle>
          <DialogDescription>Against invoice {row?.invoice_number} · still open {formatINR(open_)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cn-file">Credit note file (PDF/JPG/PNG) *</Label>
            <Input id="cn-file" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={(e) => onFile(e.target.files?.[0] || null)} />
            {parsing && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading…</p>}
            {read && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Sparkles className="h-3 w-3" /> Read by AI. Please check the details.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="cn-num">Number *</Label><Input id="cn-num" value={number} onChange={(e) => setNumber(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1.5"><Label htmlFor="cn-date">Date</Label><Input id="cn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="cn-amt">Amount *</Label><Input id="cn-amt" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} /></div>
          <div className="space-y-1.5"><Label htmlFor="cn-why">Reason *</Label><Textarea id="cn-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></div>
          {dueBack > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              {formatINR(dueBack)} of this is already paid. It becomes an amount due back from you, set against your next invoice.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button className="bg-violet-700 text-white hover:bg-violet-800" onClick={save} disabled={busy}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Raise credit note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The project owner approves or rejects the PI / Quotation, then Accounts gives the final approval. */
export function DecidePiDialog({ open, onOpenChange, row, onDone }: BaseProps) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  useEffect(() => { if (open) setComment(""); }, [open]);
  // Second approval: the project owner has already approved, so this is Accounts.
  const accountsStep = row?.pi_approval_stage === "awaiting_accounts";

  const decide = async (approve: boolean) => {
    if (!row) return;
    if (!approve && !comment.trim()) return toast.error("Add a comment so the vendor knows what to fix");
    setSaving(approve ? "approve" : "reject");
    try {
      const { error } = await supabase.rpc("decide_pi", { p_id: row.id, p_approve: approve, p_comment: comment.trim() || null });
      if (error) throw new Error(error.message);
      // The owner approved, so it now sits with Accounts: tell them.
      if (approve && !accountsStep) supabase.functions.invoke("notify-pi-awaiting-accounts", { body: { row_id: row.id } }).catch(() => {});
      toast.success(approve ? (accountsStep ? "Approved. Accounts can now issue the PO" : "Approved. It now goes to Accounts for approval") : "Rejected. The comment is on the vendor's row");
      onOpenChange(false);
      onDone({ approved: approve, final: approve && accountsStep });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{accountsStep ? "Accounts approval: " : ""}Approve or reject the {row ? docKindLabel(row) : "PI"}</DialogTitle>
          <DialogDescription>{row?.vendors?.company_name} · {row?.project_number} {row?.project_name}</DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3 text-sm">
              <span><b>{docNumber(row) || "—"}</b> · {formatINR(row.pi_amount)}</span>
              <FileActions fileKey={docFileKey(row)} label={`${docKindLabel(row)} ${docNumber(row) || ""}`} downloadName={`${docKindLabel(row)}-${docNumber(row) || row.id.slice(0, 6)}`} />
            </div>
            {row.pi_vendor_remarks && <p className="text-xs text-muted-foreground">Vendor remarks: {row.pi_vendor_remarks}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="dec-cm">Comment (needed to reject)</Label>
              <Textarea id="dec-cm" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!saving}>Cancel</Button>
          <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => decide(false)} disabled={!!saving}>{saving === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}</Button>
          <Button className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => decide(true)} disabled={!!saving}>{saving === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

