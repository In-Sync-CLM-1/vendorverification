import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadInvoiceFile, analyzeInvoiceFile, InvoiceExtraction, LOW_CONFIDENCE } from "@/lib/invoices";
import { Loader2, Upload, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onUploaded: () => void;
}

function FieldLabel({ text, confidence }: { text: string; confidence?: number }) {
  const low = confidence !== undefined && confidence < LOW_CONFIDENCE;
  return (
    <Label className={cn("flex items-center gap-1.5", low && "text-amber-600 dark:text-amber-400")}>
      {text}
      {low && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-normal">
          <TriangleAlert className="h-3 w-3" /> please verify
        </span>
      )}
    </Label>
  );
}

export function InvoiceUploadDialog({ open, onOpenChange, vendorId, onUploaded }: InvoiceUploadDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amount, setAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [description, setDescription] = useState("");
  const [poNumber, setPoNumber] = useState("");

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceFileKey, setInvoiceFileKey] = useState<string | null>(null);
  const [poFile, setPoFile] = useState<File | null>(null);
  const [poFileKey, setPoFileKey] = useState<string | null>(null);

  const [parsingInvoice, setParsingInvoice] = useState(false);
  const [parsingPo, setParsingPo] = useState(false);
  const [invoiceRead, setInvoiceRead] = useState<InvoiceExtraction | null>(null);
  const [poRead, setPoRead] = useState<InvoiceExtraction | null>(null);

  const [saving, setSaving] = useState(false);

  const reset = () => {
    setInvoiceNumber("");
    setInvoiceDate("");
    setAmount("");
    setGstAmount("");
    setDescription("");
    setPoNumber("");
    setInvoiceFile(null);
    setInvoiceFileKey(null);
    setPoFile(null);
    setPoFileKey(null);
    setInvoiceRead(null);
    setPoRead(null);
  };

  const handleInvoiceFileChange = async (file: File | null) => {
    setInvoiceFile(file);
    setInvoiceFileKey(null);
    setInvoiceRead(null);
    if (!file) return;

    setParsingInvoice(true);
    try {
      const key = await uploadInvoiceFile(file);
      setInvoiceFileKey(key);
      try {
        const result = await analyzeInvoiceFile(key);
        setInvoiceRead(result);
        if (result.invoice_number) setInvoiceNumber(result.invoice_number);
        if (result.invoice_date) setInvoiceDate(result.invoice_date);
        if (result.invoice_amount != null) setAmount(String(result.invoice_amount));
        if (result.gst_amount != null) setGstAmount(String(result.gst_amount));
        if (result.po_number) setPoNumber((prev) => prev || result.po_number!);
        if (result.description) setDescription(result.description);
        toast.success("Invoice read — please review the fields below");
      } catch (err: any) {
        toast.error(err.message || "Could not read this file automatically — please fill in the details below");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setParsingInvoice(false);
    }
  };

  const handlePoFileChange = async (file: File | null) => {
    setPoFile(file);
    setPoFileKey(null);
    setPoRead(null);
    if (!file) return;

    setParsingPo(true);
    try {
      const key = await uploadInvoiceFile(file);
      setPoFileKey(key);
      try {
        const result = await analyzeInvoiceFile(key);
        setPoRead(result);
        if (result.po_number) setPoNumber(result.po_number);
      } catch (err: any) {
        toast.error(err.message || "Could not read the PO automatically — please fill in the PO number below");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setParsingPo(false);
    }
  };

  const handleSubmit = async () => {
    if (!invoiceFileKey) return toast.error("Attach the invoice file (PDF/JPG/PNG)");
    if (!invoiceNumber.trim()) return toast.error("Enter the invoice number");
    if (!invoiceDate) return toast.error("Select the invoice date");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid invoice amount");
    const gst = gstAmount ? parseFloat(gstAmount) : 0;
    if (gst < 0 || gst > amt) return toast.error("GST amount cannot exceed the invoice amount");

    setSaving(true);
    try {
      const { data: inserted, error } = await supabase.from("vendor_invoices").insert({
        vendor_id: vendorId,
        // tenant_id is derived server-side from the vendor
        tenant_id: "00000000-0000-0000-0000-000000000000",
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        invoice_amount: amt,
        gst_amount: gst,
        description: description.trim() || null,
        po_number: poNumber.trim() || null,
        po_file_key: poFileKey,
        invoice_file_key: invoiceFileKey,
        ai_extracted_data: (invoiceRead || poRead) ? { invoice: invoiceRead, po: poRead } : null,
        ai_confidence_score: invoiceRead?.overall_confidence ?? null,
        ai_model_version: invoiceRead?.ai_model_version ?? poRead?.ai_model_version ?? null,
      }).select("id").single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("An invoice with this number already exists");
        }
        throw new Error(error.message);
      }

      // Alert approvers (email + WhatsApp) that a new invoice needs review. Non-blocking.
      if (inserted?.id) {
        supabase.functions.invoke("notify-invoice-submitted", { body: { invoice_id: inserted.id } }).catch(() => {
          // Notification failure shouldn't block the vendor's submission
        });
      }

      toast.success("Invoice submitted for review");
      reset();
      onOpenChange(false);
      onUploaded();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit invoice");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || parsingInvoice || parsingPo;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Invoice</DialogTitle>
          <DialogDescription>
            Attach the invoice document — an AI reads it and fills the details below for you.
            Review and correct anything it missed, then submit. Once submitted, the details
            cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-file">Invoice File (PDF/JPG/PNG, max 10MB) *</Label>
            <Input
              id="inv-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={busy}
              onChange={(e) => handleInvoiceFileChange(e.target.files?.[0] || null)}
            />
            {parsingInvoice && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading invoice…
              </p>
            )}
            {!parsingInvoice && invoiceRead && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Auto-filled by AI — review before submitting
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel text="Invoice Number *" confidence={invoiceRead?.invoice_number_confidence} />
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" disabled={parsingInvoice} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="Invoice Date *" confidence={invoiceRead?.invoice_date_confidence} />
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} disabled={parsingInvoice} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel text="Invoice Amount (₹, incl. GST) *" confidence={invoiceRead?.invoice_amount_confidence} />
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={parsingInvoice} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="GST Portion (₹)" confidence={invoiceRead?.gst_amount_confidence} />
              <Input type="number" min="0" step="0.01" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} placeholder="0.00" disabled={parsingInvoice} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-desc">Description</Label>
            <Textarea id="inv-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Goods / services covered by this invoice" rows={2} disabled={parsingInvoice} />
          </div>

          <div className="rounded-lg border border-dashed p-3 space-y-3">
            <p className="text-sm font-medium">Purchase Order (optional)</p>
            <div className="space-y-1.5">
              <Label htmlFor="po-file">PO File (PDF/JPG/PNG, max 10MB)</Label>
              <Input
                id="po-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={busy}
                onChange={(e) => handlePoFileChange(e.target.files?.[0] || null)}
              />
              {parsingPo && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Reading PO…
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <FieldLabel text="PO Number" confidence={poRead?.po_number_confidence ?? invoiceRead?.po_number_confidence} />
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-001" disabled={parsingPo} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" /> Submit Invoice
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
