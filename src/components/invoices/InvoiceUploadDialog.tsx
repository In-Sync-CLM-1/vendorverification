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
import { uploadInvoiceFile } from "@/lib/invoices";
import { Loader2, Upload } from "lucide-react";

interface InvoiceUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onUploaded: () => void;
}

export function InvoiceUploadDialog({ open, onOpenChange, vendorId, onUploaded }: InvoiceUploadDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amount, setAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [description, setDescription] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [poFile, setPoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setInvoiceNumber("");
    setInvoiceDate("");
    setAmount("");
    setGstAmount("");
    setDescription("");
    setPoNumber("");
    setInvoiceFile(null);
    setPoFile(null);
  };

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) return toast.error("Enter the invoice number");
    if (!invoiceDate) return toast.error("Select the invoice date");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid invoice amount");
    const gst = gstAmount ? parseFloat(gstAmount) : 0;
    if (gst < 0 || gst > amt) return toast.error("GST amount cannot exceed the invoice amount");
    if (!invoiceFile) return toast.error("Attach the invoice file (PDF/JPG/PNG)");

    setSaving(true);
    try {
      const invoiceKey = await uploadInvoiceFile(invoiceFile);
      const poKey = poFile ? await uploadInvoiceFile(poFile) : null;

      const { error } = await supabase.from("vendor_invoices").insert({
        vendor_id: vendorId,
        // tenant_id is derived server-side from the vendor
        tenant_id: "00000000-0000-0000-0000-000000000000",
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        invoice_amount: amt,
        gst_amount: gst,
        description: description.trim() || null,
        po_number: poNumber.trim() || null,
        po_file_key: poKey,
        invoice_file_key: invoiceKey,
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("An invoice with this number already exists");
        }
        throw new Error(error.message);
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

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Invoice</DialogTitle>
          <DialogDescription>
            Submit an invoice for review and payment. Attach the invoice document; a purchase
            order is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-no">Invoice Number *</Label>
              <Input id="inv-no" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-date">Invoice Date *</Label>
              <Input id="inv-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-amt">Invoice Amount (₹, incl. GST) *</Label>
              <Input id="inv-amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-gst">GST Portion (₹)</Label>
              <Input id="inv-gst" type="number" min="0" step="0.01" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-desc">Description</Label>
            <Textarea id="inv-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Goods / services covered by this invoice" rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-file">Invoice File (PDF/JPG/PNG, max 10MB) *</Label>
            <Input
              id="inv-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="rounded-lg border border-dashed p-3 space-y-3">
            <p className="text-sm font-medium">Purchase Order (optional)</p>
            <div className="space-y-1.5">
              <Label htmlFor="po-no">PO Number</Label>
              <Input id="po-no" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-file">PO File (PDF/JPG/PNG, max 10MB)</Label>
              <Input
                id="po-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setPoFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
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
