import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadInvoiceFile, analyzeInvoiceFile, InvoiceExtraction, LOW_CONFIDENCE, formatINR } from "@/lib/invoices";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingRow, advPaid, poOf, paidOut, tdsTotal, settledTotal } from "@/lib/billing";

function FieldLabel({ text, confidence }: { text: string; confidence?: number }) {
  const low = confidence !== undefined && confidence < LOW_CONFIDENCE;
  return (
    <Label className={cn("flex items-center gap-1.5", low && "text-amber-600")}>
      {text}
      {low && <span className="inline-flex items-center gap-0.5 text-[11px] font-normal"><TriangleAlert className="h-3 w-3" /> please verify</span>}
    </Label>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BillingRow | null;
  onDone: () => void;
}

/** The invoice takes the place of the PI on this row. */
export function UploadInvoiceDialog({ open, onOpenChange, row, onDone }: Props) {
  const po = row ? poOf(row) : null;
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [description, setDescription] = useState("");
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [read, setRead] = useState<InvoiceExtraction | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumber(""); setDate(""); setDue(""); setGst(""); setDescription("");
    setAmount(po ? String(po.grand_total) : "");
    setFileKey(null); setRead(null);
  }, [open, po]);

  const onFile = async (file: File | null) => {
    setFileKey(null);
    setRead(null);
    if (!file) return;
    setParsing(true);
    try {
      const key = await uploadInvoiceFile(file, row?.vendor_id);
      setFileKey(key);
      try {
        const r = await analyzeInvoiceFile(key);
        setRead(r);
        if (r.invoice_number) setNumber(r.invoice_number);
        if (r.invoice_date) setDate(r.invoice_date);
        if (r.due_date) setDue(r.due_date);
        if (r.invoice_amount != null) setAmount(String(r.invoice_amount));
        if (r.gst_amount != null) setGst(String(r.gst_amount));
        if (r.description) setDescription(r.description);
        toast.success("Invoice read. Please review the fields below");
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : "Could not read this file automatically. Please fill in the details");
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Upload failed. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!row || !po) return;
    if (!fileKey) return toast.error("Attach the invoice file (PDF/JPG/PNG)");
    if (!number.trim()) return toast.error("Enter the invoice number");
    if (!date) return toast.error("Select the invoice date");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid invoice amount");
    const g = gst ? parseFloat(gst) : 0;
    if (g < 0 || g > amt) return toast.error("GST amount cannot exceed the invoice amount");
    if (amt > Number(po.grand_total) + 1) return toast.error(`This invoice (${formatINR(amt)}) is more than the PO amount ${formatINR(po.grand_total)}`);

    setSaving(true);
    try {
      const { error } = await supabase.rpc("submit_invoice_on_row", {
        p_id: row.id,
        p_number: number.trim(),
        p_date: date,
        p_amount: amt,
        p_gst: g,
        p_description: description.trim() || null,
        p_file_key: fileKey,
        p_due: due || null,
        p_ai_data: (read ? { invoice: read } : null) as never,
        p_ai_confidence: read?.overall_confidence ?? null,
        p_ai_model: read?.ai_model_version ?? null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("An invoice with this number already exists");
        throw new Error(error.message);
      }
      toast.success("Invoice submitted. It has taken the place of the PI on this row");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to submit invoice");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || parsing;
  const settledSoFar = row ? settledTotal(row) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload invoice</DialogTitle>
          <DialogDescription>
            Against PO {po?.po_number} · {formatINR(po?.grand_total)}. This invoice takes the place of the PI on this row. Once
            submitted, its details cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-file">Invoice file (PDF/JPG/PNG) *</Label>
            <Input id="inv-file" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={(e) => onFile(e.target.files?.[0] || null)} />
            {parsing && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading invoice…</p>}
            {!parsing && read && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Sparkles className="h-3 w-3" /> Read by AI. Please check the details.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel text="Invoice number *" confidence={read?.invoice_number_confidence} />
              <Input value={number} onChange={(e) => setNumber(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="Invoice date *" confidence={read?.invoice_date_confidence} />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="Amount *" confidence={read?.invoice_amount_confidence} />
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="GST" confidence={read?.gst_amount_confidence} />
              <Input type="number" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="Due date" confidence={read?.due_date_confidence} />
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={busy} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-desc">Description</Label>
            <Textarea id="inv-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
          </div>

          {row && settledSoFar > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Already settled against this PO</p>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 tabular-nums">
                {advPaid(row) > 0 && (<><span>Advance paid{row.adv_paid_on ? ` · ${new Date(row.adv_paid_on + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}</span><span className="text-right">{formatINR(advPaid(row))}</span></>)}
                {paidOut(row) > 0 && (<><span>Paid out</span><span className="text-right">{formatINR(paidOut(row))}</span></>)}
                <span>TDS deducted</span><span className="text-right">{formatINR(tdsTotal(row))}</span>
                <span className="border-t pt-1 font-semibold">Total settled</span><span className="border-t pt-1 text-right font-semibold">{formatINR(settledSoFar)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>) : "Submit invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
