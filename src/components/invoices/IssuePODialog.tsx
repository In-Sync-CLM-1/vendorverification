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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/invoices";
import { issuePurchaseOrder, inferTaxType } from "@/lib/purchaseOrders";
import { Loader2, FileText } from "lucide-react";

interface IssuePOTarget {
  id: string; // pi_quotation id
  vendor_id: string;
  vendorName: string;
  projectName: string;
  projectNumber: string | null;
  amount: number | null;
  documentType: "proforma_invoice" | "quotation";
}

interface IssuePODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: IssuePOTarget;
  onIssued: () => void;
}

export function IssuePODialog({ open, onOpenChange, target, onIssued }: IssuePODialogProps) {
  const [description, setDescription] = useState("");
  const [hsnSac, setHsnSac] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [taxableAmount, setTaxableAmount] = useState("");
  const [taxType, setTaxType] = useState<"igst" | "cgst_sgst" | "none">("igst");
  const [taxRate, setTaxRate] = useState("18");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: gstInfo } = useQuery({
    queryKey: ["po-gst-info", target.vendor_id],
    queryFn: async () => {
      const { data: vendor } = await supabase.from("vendors").select("gst_number, tenant_id").eq("id", target.vendor_id).single();
      const { data: tenant } = vendor ? await supabase.from("tenants").select("gstin").eq("id", vendor.tenant_id).single() : { data: null };
      return { vendorGstin: vendor?.gst_number || null, issuerGstin: tenant?.gstin || null };
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setDescription(`Towards ${target.documentType === "quotation" ? "Quotation" : "Proforma Invoice"} for ${target.projectName}`);
    setHsnSac("");
    setPlaceOfSupply("");
    setPoDate(new Date().toISOString().slice(0, 10));
    setTaxRate("18");
    // The PI's own amount is treated as grand-total-inclusive, same convention
    // as everywhere else this app captures an "amount" from AI extraction --
    // back out the taxable base at the default 18% so the grand total starts
    // out matching what was actually approved. Accounts can correct either
    // figure before issuing.
    if (target.amount != null) {
      setTaxableAmount(String(Math.round((target.amount / 1.18) * 100) / 100));
    } else {
      setTaxableAmount("");
    }
  }, [open, target]);

  useEffect(() => {
    if (gstInfo) setTaxType(inferTaxType(gstInfo.vendorGstin, gstInfo.issuerGstin));
  }, [gstInfo]);

  const taxable = parseFloat(taxableAmount) || 0;
  const rate = parseFloat(taxRate) || 0;
  const taxAmt = taxType === "none" ? 0 : Math.round(((taxable * rate) / 100) * 100) / 100;
  const grandTotal = taxable + taxAmt;

  const handleIssue = async () => {
    if (!description.trim()) return toast.error("Enter a description of the work");
    if (!placeOfSupply.trim()) return toast.error("Enter the place of supply");
    if (taxable <= 0) return toast.error("Enter a valid taxable amount");

    setSaving(true);
    try {
      await issuePurchaseOrder({
        pi_quotation_id: target.id,
        description: description.trim(),
        hsn_sac: hsnSac.trim(),
        place_of_supply: placeOfSupply.trim(),
        taxable_amount: taxable,
        tax_type: taxType,
        tax_rate: rate,
        po_date: poDate,
        vendor_id: target.vendor_id,
      });
      toast.success("Purchase Order issued");
      onOpenChange(false);
      onIssued();
    } catch (err: any) {
      toast.error(err.message || "Failed to issue Purchase Order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Issue Purchase Order
          </DialogTitle>
          <DialogDescription>
            {target.vendorName} · {target.projectNumber || target.projectName}
            {target.amount != null && <> · approved at {formatINR(target.amount)}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="po-date">PO Date *</Label>
            <Input id="po-date" type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-desc">Description *</Label>
            <Textarea id="po-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Towards Event Setup Charges for..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-hsn">HSN/SAC</Label>
              <Input id="po-hsn" value={hsnSac} onChange={(e) => setHsnSac(e.target.value)} placeholder="998596" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-pos">Place Of Supply *</Label>
              <Input id="po-pos" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="Maharashtra" />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">Amount</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="po-taxable">Taxable Amount (₹) *</Label>
                <Input id="po-taxable" type="number" min="0" step="0.01" value={taxableAmount} onChange={(e) => setTaxableAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-taxtype">Tax</Label>
                <Select value={taxType} onValueChange={(v) => setTaxType(v as typeof taxType)}>
                  <SelectTrigger id="po-taxtype"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="igst">IGST</SelectItem>
                    <SelectItem value="cgst_sgst">CGST + SGST</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {taxType !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="po-rate">Tax Rate (%)</Label>
                <Input id="po-rate" type="number" min="0" step="0.01" className="max-w-[120px]" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Grand Total</span>
              <span className="font-semibold">{formatINR(grandTotal)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleIssue} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Issuing…
              </>
            ) : (
              "Issue Purchase Order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
