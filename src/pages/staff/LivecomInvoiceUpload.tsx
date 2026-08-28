import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { VendorCombobox, VendorOption } from "@/components/shared/VendorCombobox";
import { ProjectCombobox, RmplProject } from "@/components/shared/ProjectCombobox";
import { uploadInvoiceFile, formatINR, INVOICE_STATUS_META, InvoiceStatus } from "@/lib/invoices";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Plus, FileUp } from "lucide-react";

interface AllocationRow {
  key: string;
  project: RmplProject | null;
  amount: string;
}

interface RecentUpload {
  id: string;
  invoice_number: string;
  invoice_amount: number;
  status: InvoiceStatus;
  created_at: string;
  vendors: { company_name: string } | null;
}

const newRow = (): AllocationRow => ({ key: crypto.randomUUID(), project: null, amount: "" });

export default function LivecomInvoiceUpload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [vendor, setVendor] = useState<VendorOption | null>(null);
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

  const [split, setSplit] = useState(false);
  const [singleProject, setSingleProject] = useState<RmplProject | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([newRow(), newRow()]);

  const [saving, setSaving] = useState(false);

  const { data: recentUploads = [], isLoading: loadingRecent } = useQuery({
    queryKey: ["livecom-recent-uploads", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("id, invoice_number, invoice_amount, status, created_at, vendors(company_name)")
        .eq("submission_source", "livecom_upload")
        .eq("submitted_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as unknown as RecentUpload[];
    },
    enabled: !!user?.id,
  });

  const reset = () => {
    setVendor(null);
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
    setSplit(false);
    setSingleProject(null);
    setAllocations([newRow(), newRow()]);
  };

  const handleInvoiceFileChange = async (file: File | null) => {
    setInvoiceFile(file);
    setInvoiceFileKey(null);
    if (!file || !vendor) return;
    setUploadingInvoice(true);
    try {
      const key = await uploadInvoiceFile(file, vendor.id);
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
    if (!file || !vendor) return;
    setUploadingPo(true);
    try {
      const key = await uploadInvoiceFile(file, vendor.id);
      setPoFileKey(key);
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploadingPo(false);
    }
  };

  const updateAllocation = (key: string, patch: Partial<AllocationRow>) => {
    setAllocations((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const allocationTotal = allocations.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const amountNum = parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (!vendor) return toast.error("Select the vendor this invoice is for");
    if (!invoiceFileKey) return toast.error("Attach the invoice file (PDF/JPG/PNG) — pick the vendor first");
    if (!invoiceNumber.trim()) return toast.error("Enter the invoice number");
    if (!invoiceDate) return toast.error("Select the invoice date");
    if (!amountNum || amountNum <= 0) return toast.error("Enter a valid invoice amount");
    const gst = gstAmount ? parseFloat(gstAmount) : 0;
    if (gst < 0 || gst > amountNum) return toast.error("GST amount cannot exceed the invoice amount");

    let payload: Array<Record<string, unknown>> = [];
    if (split) {
      const filled = allocations.filter((r) => r.project && r.amount);
      if (filled.length < 2) return toast.error("Add at least two projects to split this invoice");
      if (Math.abs(allocationTotal - amountNum) > 0.01) {
        return toast.error(`Project shares (${formatINR(allocationTotal)}) must add up to the invoice amount (${formatINR(amountNum)})`);
      }
      payload = filled.map((r) => ({
        rmpl_project_id: r.project!.id,
        project_number: r.project!.project_number,
        project_name: r.project!.project_name,
        project_owner_user_id: r.project!.project_owner_user_id,
        project_owner_name: r.project!.project_owner_name,
        project_owner_email: r.project!.project_owner_email,
        amount: parseFloat(r.amount),
      }));
    } else if (singleProject) {
      payload = [{
        rmpl_project_id: singleProject.id,
        project_number: singleProject.project_number,
        project_name: singleProject.project_name,
        project_owner_user_id: singleProject.project_owner_user_id,
        project_owner_name: singleProject.project_owner_name,
        project_owner_email: singleProject.project_owner_email,
        amount: amountNum,
      }];
    }

    setSaving(true);
    try {
      const { data: invoiceId, error } = await supabase.rpc("submit_livecom_invoice" as any, {
        p_vendor_id: vendor.id,
        p_invoice_number: invoiceNumber.trim(),
        p_invoice_date: invoiceDate,
        p_invoice_amount: amountNum,
        p_gst_amount: gst,
        p_description: description.trim() || null,
        p_po_number: poNumber.trim() || null,
        p_invoice_file_key: invoiceFileKey,
        p_po_file_key: poFileKey,
        p_allocations: payload,
      });
      if (error) {
        if ((error as any).code === "23505") throw new Error("An invoice with this number already exists for this vendor");
        throw new Error(error.message);
      }

      const { data: inserted } = await supabase
        .from("vendor_invoices")
        .select("status")
        .eq("id", invoiceId as string)
        .maybeSingle();

      // Only alert approvers when this actually needs their review — an
      // auto-approved (Gaurav) upload has nothing for them to act on.
      if (inserted?.status !== "approved") {
        supabase.functions
          .invoke("notify-invoice-submitted", { body: { invoice_id: invoiceId } })
          .catch(() => {});
      }

      toast.success(
        inserted?.status === "approved"
          ? "Invoice uploaded and approved — ready for payment"
          : "Invoice uploaded — sent to the staff review queue"
      );
      reset();
      queryClient.invalidateQueries({ queryKey: ["livecom-recent-uploads"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit invoice");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploadingInvoice || uploadingPo;

  return (
    <StaffLayout title="Upload Invoice for Vendor">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Upload Invoice for Vendor</h1>
          <p className="text-sm text-muted-foreground">
            For vendors who can't use the vendor portal themselves — file the invoice on their
            behalf. Uploads other than Gaurav Chadha's go to the normal staff review queue before
            they're payable.
          </p>
        </div>

        <div className="p-4 space-y-4 max-w-2xl">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Vendor *</Label>
                <VendorCombobox value={vendor?.id || null} valueName={vendor?.company_name} onChange={setVendor} disabled={busy} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lc-inv-file">Invoice File (PDF/JPG/PNG, max 20MB) *</Label>
                <Input
                  id="lc-inv-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={busy || !vendor}
                  onChange={(e) => handleInvoiceFileChange(e.target.files?.[0] || null)}
                />
                {!vendor && <p className="text-xs text-muted-foreground">Select a vendor first</p>}
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
                  <Label htmlFor="lc-po-file">PO File (PDF/JPG/PNG, max 20MB)</Label>
                  <Input
                    id="lc-po-file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={busy || !vendor}
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

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">This invoice covers more than one project</p>
                  <p className="text-xs text-muted-foreground">
                    A single combined PI/invoice presented to the company, with each project's
                    share declared separately. The invoice is still approved or rejected once, as
                    one document.
                  </p>
                </div>
                <Switch checked={split} onCheckedChange={setSplit} disabled={busy} />
              </div>

              {!split ? (
                <div className="space-y-1.5">
                  <Label>Project (optional)</Label>
                  <ProjectCombobox
                    value={singleProject?.id || null}
                    valueName={singleProject?.project_name}
                    onChange={setSingleProject}
                    disabled={busy}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {allocations.map((row) => (
                    <div key={row.key} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <ProjectCombobox
                          value={row.project?.id || null}
                          valueName={row.project?.project_name}
                          onChange={(p) => updateAllocation(row.key, { project: p })}
                          disabled={busy}
                        />
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Share (₹)"
                        className="w-32"
                        value={row.amount}
                        onChange={(e) => updateAllocation(row.key, { amount: e.target.value })}
                        disabled={busy}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy || allocations.length <= 2}
                        onClick={() => setAllocations((rows) => rows.filter((r) => r.key !== row.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setAllocations((rows) => [...rows, newRow()])}>
                    <Plus className="h-4 w-4 mr-1" /> Add Project
                  </Button>
                  <p className={`text-xs ${Math.abs(allocationTotal - amountNum) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                    Shares total {formatINR(allocationTotal)} of {formatINR(amountNum)}
                  </p>
                </div>
              )}
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
                            <TableCell>{inv.vendors?.company_name || "—"}</TableCell>
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
