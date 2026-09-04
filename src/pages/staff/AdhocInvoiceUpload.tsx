import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { uploadInvoiceFile, formatINR, INVOICE_STATUS_META, InvoiceStatus } from "@/lib/invoices";
import { toast } from "sonner";
import { Loader2, Upload, FileUp, TriangleAlert } from "lucide-react";

interface RecentUpload {
  id: string;
  invoice_number: string;
  invoice_amount: number;
  status: InvoiceStatus;
  created_at: string;
  adhoc_vendor_name: string | null;
}

export default function AdhocInvoiceUpload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
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
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [uploadingPo, setUploadingPo] = useState(false);

  const [saving, setSaving] = useState(false);

  const { data: recentUploads = [], isLoading: loadingRecent } = useQuery({
    queryKey: ["adhoc-recent-uploads", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("id, invoice_number, invoice_amount, status, created_at, adhoc_vendor_name")
        .eq("submission_source", "adhoc_upload")
        .eq("submitted_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as RecentUpload[];
    },
    enabled: !!user?.id,
  });

  const reset = () => {
    setVendorName("");
    setVendorContact("");
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
  };

  const handleInvoiceFileChange = async (file: File | null) => {
    setInvoiceFile(file);
    setInvoiceFileKey(null);
    if (!file) return;
    setUploadingInvoice(true);
    try {
      const key = await uploadInvoiceFile(file);
      setInvoiceFileKey(key);
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handlePoFileChange = async (file: File | null) => {
    setPoFile(file);
    setPoFileKey(null);
    if (!file) return;
    setUploadingPo(true);
    try {
      const key = await uploadInvoiceFile(file);
      setPoFileKey(key);
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploadingPo(false);
    }
  };

  const amountNum = parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (!vendorName.trim()) return toast.error("Enter the vendor's name");
    if (!invoiceFileKey) return toast.error("Attach the invoice file (PDF/JPG/PNG)");
    if (!invoiceNumber.trim()) return toast.error("Enter the invoice number");
    if (!invoiceDate) return toast.error("Select the invoice date");
    if (!amountNum || amountNum <= 0) return toast.error("Enter a valid invoice amount");
    const gst = gstAmount ? parseFloat(gstAmount) : 0;
    if (gst < 0 || gst > amountNum) return toast.error("GST amount cannot exceed the invoice amount");

    setSaving(true);
    try {
      const { data: invoiceId, error } = await supabase.rpc("submit_adhoc_invoice" as any, {
        p_adhoc_vendor_name: vendorName.trim(),
        p_adhoc_vendor_contact: vendorContact.trim() || null,
        p_invoice_number: invoiceNumber.trim(),
        p_invoice_date: invoiceDate,
        p_invoice_amount: amountNum,
        p_gst_amount: gst,
        p_description: description.trim() || null,
        p_po_number: poNumber.trim() || null,
        p_invoice_file_key: invoiceFileKey,
        p_po_file_key: poFileKey,
      });
      if (error) throw new Error(error.message);

      supabase.functions
        .invoke("notify-invoice-submitted", { body: { invoice_id: invoiceId } })
        .catch(() => {});

      toast.success("Adhoc invoice uploaded — sent to the staff review queue");
      reset();
      queryClient.invalidateQueries({ queryKey: ["adhoc-recent-uploads"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit invoice");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploadingInvoice || uploadingPo;

  return (
    <StaffLayout title="Adhoc Invoice Upload">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Adhoc Invoice Upload</h1>
          <p className="text-sm text-muted-foreground">
            For purchases from a vendor who isn't verified in this system — record the full invoice
            details against their name directly. It goes to the normal staff review queue before
            it's payable, same as any other invoice.
          </p>
        </div>

        <div className="p-4 space-y-4 max-w-2xl">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex items-start gap-2">
            <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              This vendor has not gone through verification. The invoice will be marked
              "Unverified vendor" throughout the review and payment screens.
            </p>
          </div>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Vendor Name *</Label>
                  <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Sharma General Store" disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vendor Contact</Label>
                  <Input value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} placeholder="Phone / email (optional)" disabled={busy} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ad-inv-file">Invoice File (PDF/JPG/PNG, max 20MB) *</Label>
                <Input
                  id="ad-inv-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={busy}
                  onChange={(e) => handleInvoiceFileChange(e.target.files?.[0] || null)}
                />
                {uploadingInvoice && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Invoice Number *</Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label>Invoice Date *</Label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} disabled={busy} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Invoice Amount (₹, incl. GST) *</Label>
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label>GST Portion (₹)</Label>
                  <Input type="number" min="0" step="0.01" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} placeholder="0.00" disabled={busy} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Goods / services covered by this invoice" rows={2} disabled={busy} />
              </div>

              <div className="rounded-lg border border-dashed p-3 space-y-3">
                <p className="text-sm font-medium">Purchase Order (optional)</p>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-po-file">PO File (PDF/JPG/PNG, max 20MB)</Label>
                  <Input
                    id="ad-po-file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={busy}
                    onChange={(e) => handlePoFileChange(e.target.files?.[0] || null)}
                  />
                  {uploadingPo && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>PO Number</Label>
                  <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-001" disabled={busy} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSubmit} disabled={busy} className="w-full">
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Submit Invoice</>
            )}
          </Button>

          <Card>
            <CardContent className="p-0">
              <div className="p-4 pb-2">
                <p className="text-sm font-medium flex items-center gap-1.5"><FileUp className="h-4 w-4" /> Your Recent Uploads</p>
              </div>
              {loadingRecent ? (
                <div className="p-6 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : recentUploads.length === 0 ? (
                <p className="p-4 pt-0 text-sm text-muted-foreground">Nothing uploaded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentUploads.map((inv) => {
                        const meta = INVOICE_STATUS_META[inv.status];
                        return (
                          <TableRow key={inv.id}>
                            <TableCell>{inv.adhoc_vendor_name || "—"}</TableCell>
                            <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                            <TableCell className="text-right">{formatINR(Number(inv.invoice_amount))}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </StaffLayout>
  );
}
