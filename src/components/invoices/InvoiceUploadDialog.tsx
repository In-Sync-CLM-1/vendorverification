import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadInvoiceFile, analyzeInvoiceFile, InvoiceExtraction, LOW_CONFIDENCE, formatINR } from "@/lib/invoices";
import { Loader2, Upload, Sparkles, TriangleAlert, HandCoins, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvailablePurchaseOrder {
  id: string;
  po_number: string;
  pi_quotation_id: string;
  grand_total: number;
  pdf_file_key: string | null;
  created_at: string;
  vendor_pi_quotations: {
    document_type: "proforma_invoice" | "quotation";
    document_number: string | null;
    amount: number | null;
    project_number: string | null;
    project_name: string | null;
  } | null;
}

interface VendorAdvanceRequest {
  id: string;
  amount: number;
  activity_name: string;
  status: "pending" | "approved" | "rejected";
  project_name: string | null;
  created_at: string;
}

interface InvoiceUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onUploaded: () => void;
  advanceRequests?: VendorAdvanceRequest[];
  advanceAvailable?: number;
}

const ADVANCE_STATUS_META = {
  pending: { label: "Pending Review", className: "bg-amber-100 text-amber-800 border-amber-200" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rejected: { label: "Not Approved", className: "bg-red-100 text-red-800 border-red-200" },
} as const;

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

export function InvoiceUploadDialog({ open, onOpenChange, vendorId, onUploaded, advanceRequests = [], advanceAvailable = 0 }: InvoiceUploadDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [description, setDescription] = useState("");

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceFileKey, setInvoiceFileKey] = useState<string | null>(null);

  const [parsingInvoice, setParsingInvoice] = useState(false);
  const [invoiceRead, setInvoiceRead] = useState<InvoiceExtraction | null>(null);

  const [saving, setSaving] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // An invoice can only be raised against a Purchase Order Accounts has
  // already issued -- no PO, no invoice. Each PO traces back to the PI it
  // was issued against; settling that PI into this invoice (as before)
  // carries the PO across with it (see settle_pi_into_invoice).
  const { data: availablePOs = [], isLoading: loadingPOs } = useQuery({
    queryKey: ["vendor-available-purchase-orders", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, pi_quotation_id, grand_total, pdf_file_key, created_at, vendor_pi_quotations(document_type, document_number, amount, project_number, project_name)")
        .eq("vendor_id", vendorId)
        .is("invoice_id", null)
        .not("pi_quotation_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AvailablePurchaseOrder[];
    },
    enabled: open && !!vendorId,
  });

  useEffect(() => {
    if (open && !selectedPoId && availablePOs.length === 1) setSelectedPoId(availablePOs[0].id);
  }, [open, availablePOs, selectedPoId]);

  const selectedPo = availablePOs.find((p) => p.id === selectedPoId) || null;
  const selectedPi = selectedPo?.vendor_pi_quotations || null;

  const reset = () => {
    setSelectedPoId(null);
    setInvoiceNumber("");
    setInvoiceDate("");
    setDueDate("");
    setAmount("");
    setGstAmount("");
    setDescription("");
    setInvoiceFile(null);
    setInvoiceFileKey(null);
    setInvoiceRead(null);
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
        if (result.due_date) setDueDate(result.due_date);
        if (result.invoice_amount != null) setAmount(String(result.invoice_amount));
        if (result.gst_amount != null) setGstAmount(String(result.gst_amount));
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

  const handleSubmit = async () => {
    if (!selectedPo) return toast.error("Select the Purchase Order this invoice is raised against");
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
        due_date: dueDate || null,
        invoice_amount: amt,
        gst_amount: gst,
        description: description.trim() || null,
        po_number: selectedPo.po_number,
        invoice_file_key: invoiceFileKey,
        ai_extracted_data: invoiceRead ? { invoice: invoiceRead } : null,
        ai_confidence_score: invoiceRead?.overall_confidence ?? null,
        ai_model_version: invoiceRead?.ai_model_version ?? null,
      }).select("id").single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("An invoice with this number already exists");
        }
        throw new Error(error.message);
      }

      // Settle the PI behind the selected PO into this invoice — carries its
      // project/approver across and re-points the PO at the invoice, then
      // removes the PI so the work isn't billed twice. Blocking: if it fails
      // the vendor must know the PO is still unconsumed.
      if (inserted?.id) {
        const { error: settleError } = await supabase.rpc("settle_pi_into_invoice", {
          p_invoice_id: inserted.id,
          p_pi_quotation_id: selectedPo.pi_quotation_id,
        });
        if (settleError) {
          toast.error(`Invoice submitted, but the PO could not be settled against it: ${settleError.message}`);
        }
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

  const busy = saving || parsingInvoice;

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

        {!loadingPOs && availablePOs.length === 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
            <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" /> No Purchase Order issued yet
            </p>
            <p className="text-xs text-muted-foreground">
              An invoice cannot be submitted until a Purchase Order has been issued against your
              approved PI/Quotation. Contact your point of contact once your PI is approved.
            </p>
          </div>
        )}

        {availablePOs.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5" /> Purchase Order this invoice is raised against *
            </p>
            <p className="text-xs text-muted-foreground">
              Its PI/Quotation will be closed off against this invoice, so the same work isn't
              raised twice.
            </p>
            <Select
              value={selectedPoId ?? undefined}
              onValueChange={(id) => {
                setSelectedPoId(id);
                const po = availablePOs.find((p) => p.id === id);
                if (po && !amount) setAmount(String(po.grand_total));
              }}
              disabled={busy}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select the issued Purchase Order" />
              </SelectTrigger>
              <SelectContent>
                {availablePOs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    PO #{p.po_number}
                    {p.vendor_pi_quotations?.project_number ? ` · ${p.vendor_pi_quotations.project_number}` : ""}
                    {` · ${formatINR(p.grand_total)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPo && (
              <>
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <TriangleAlert className="h-3 w-3" />
                  The {selectedPi?.document_type === "quotation" ? "quotation" : "proforma invoice"} behind
                  this PO will be removed once the invoice is submitted.
                </p>
                {parseFloat(amount) > Number(selectedPo.grand_total) + 1 && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <TriangleAlert className="h-3 w-3" />
                    This invoice ({formatINR(parseFloat(amount))}) is more than the PO amount
                    {" "}{formatINR(selectedPo.grand_total)} — it cannot be settled against it.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {advanceRequests.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <HandCoins className="h-3.5 w-3.5" /> Your Advance Requests
              </p>
              {advanceAvailable > 0 && (
                <span className="text-xs text-muted-foreground">
                  Available to adjust: <span className="font-semibold text-foreground">{formatINR(advanceAvailable)}</span>
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {advanceRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">
                    {r.activity_name} · {formatINR(Number(r.amount))}
                  </span>
                  <Badge variant="outline" className={cn("shrink-0", ADVANCE_STATUS_META[r.status].className)}>
                    {ADVANCE_STATUS_META[r.status].label}
                  </Badge>
                </div>
              ))}
            </div>
            {advanceAvailable > 0 && (
              <p className="text-xs text-muted-foreground">
                Mention in the description below if this invoice should be adjusted against the approved advance.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-file">Invoice File (PDF/JPG/PNG, max 20MB) *</Label>
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

          <div className="space-y-1.5">
            <FieldLabel text="Due Date" confidence={invoiceRead?.due_date_confidence} />
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={parsingInvoice} />
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

          {selectedPo && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-sm font-medium">Purchase Order</p>
              <p className="text-sm text-muted-foreground">PO #{selectedPo.po_number} · {formatINR(selectedPo.grand_total)}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy || availablePOs.length === 0}>
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
