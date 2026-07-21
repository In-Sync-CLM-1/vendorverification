import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, VendorInvoice } from "@/lib/invoices";
import { Loader2, IndianRupee } from "lucide-react";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: VendorInvoice;
  alreadySettled: number;
  onRecorded: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  alreadySettled,
  onRecorded,
}: RecordPaymentDialogProps) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [advance, setAdvance] = useState("");
  const [gst, setGst] = useState("");
  const [tds, setTds] = useState("");
  const [payout, setPayout] = useState("");
  const [utr, setUtr] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fullSettlement, setFullSettlement] = useState(true);
  const [saving, setSaving] = useState(false);

  const nums = useMemo(
    () => ({
      advance: parseFloat(advance) || 0,
      gst: parseFloat(gst) || 0,
      tds: parseFloat(tds) || 0,
      payout: parseFloat(payout) || 0,
    }),
    [advance, gst, tds, payout]
  );

  const totalSettled = nums.advance + nums.tds + nums.payout;
  const remaining = Number(invoice.invoice_amount) - alreadySettled;

  // How much approved advance this vendor still has available to net off,
  // across all their invoices — purely informational, doesn't gate entry.
  const { data: advanceAvailable } = useQuery({
    queryKey: ["vendor-advance-available", invoice.vendor_id],
    queryFn: async () => {
      const [{ data: approved }, { data: adjustedRows }] = await Promise.all([
        supabase.from("vendor_advance_requests").select("amount").eq("vendor_id", invoice.vendor_id).eq("status", "approved"),
        supabase.from("vendor_invoice_payments").select("advance_adjusted").eq("vendor_id", invoice.vendor_id),
      ]);
      const totalApproved = (approved || []).reduce((s, r) => s + Number(r.amount), 0);
      const totalAdjusted = (adjustedRows || []).reduce((s, r) => s + Number(r.advance_adjusted || 0), 0);
      return Math.max(totalApproved - totalAdjusted, 0);
    },
    enabled: open,
  });

  const suggestPayout = () => {
    const suggested = Math.max(remaining - nums.advance - nums.tds, 0);
    setPayout(suggested ? String(Math.round(suggested * 100) / 100) : "");
  };

  const handleSave = async () => {
    if (!paymentDate) return toast.error("Select the payment date");
    if (totalSettled <= 0) return toast.error("Enter at least one amount");

    setSaving(true);
    try {
      const { error } = await supabase.from("vendor_invoice_payments").insert({
        invoice_id: invoice.id,
        // tenant_id / vendor_id are derived server-side from the invoice
        tenant_id: "00000000-0000-0000-0000-000000000000",
        vendor_id: invoice.vendor_id,
        payment_date: paymentDate,
        advance_adjusted: nums.advance,
        gst_amount: nums.gst,
        tds_amount: nums.tds,
        payout_amount: nums.payout,
        utr_reference: utr.trim() || null,
        remarks: remarks.trim() || null,
        is_full_settlement: fullSettlement,
      });
      if (error) throw new Error(error.message);

      toast.success("Payment recorded");

      supabase.functions
        .invoke("notify-vendor-invoice-status", {
          body: {
            event: "payment_recorded",
            invoice_id: invoice.id,
            extra: { amount: totalSettled, utr: utr.trim() || undefined },
          },
        })
        .catch((e) => console.error("Vendor notification failed:", e));

      onOpenChange(false);
      setAdvance("");
      setGst("");
      setTds("");
      setPayout("");
      setUtr("");
      setRemarks("");
      onRecorded();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoice_number} · {formatINR(Number(invoice.invoice_amount))}
            {alreadySettled > 0 && (
              <> · settled so far {formatINR(alreadySettled)} · remaining {formatINR(Math.max(remaining, 0))}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Payment Date *</Label>
              <Input id="pay-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-utr">UTR / Reference No.</Label>
              <Input id="pay-utr" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="Bank UTR" />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">Settlement breakup</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay-advance">Advance Adjusted (₹)</Label>
                <Input id="pay-advance" type="number" min="0" step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0.00" />
                {!!advanceAvailable && (
                  <p className="text-xs text-muted-foreground">{formatINR(advanceAvailable)} approved advance available</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-gst">GST (₹)</Label>
                <Input id="pay-gst" type="number" min="0" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-tds">TDS Deducted (₹)</Label>
                <Input id="pay-tds" type="number" min="0" step="0.01" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pay-payout">Actual Payout (₹)</Label>
                  <button type="button" onClick={suggestPayout} className="text-xs text-primary hover:underline">
                    auto
                  </button>
                </div>
                <Input id="pay-payout" type="number" min="0" step="0.01" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total settled (advance + TDS + payout)</span>
              <span className="font-semibold flex items-center">
                <IndianRupee className="h-3.5 w-3.5" />
                {totalSettled.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
            </div>
            {totalSettled > 0 && Math.abs(totalSettled - remaining) > 0.01 && (
              <p className="text-xs text-amber-600">
                {totalSettled < remaining
                  ? `This is ${formatINR(remaining - totalSettled)} short of the remaining invoice amount — the invoice will be marked Partially Paid unless "full and final" is ticked.`
                  : `This exceeds the remaining invoice amount by ${formatINR(totalSettled - remaining)}.`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-remarks">Remarks</Label>
            <Textarea id="pay-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="e.g. 2% TDS u/s 194C, advance from PO-014" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={fullSettlement} onCheckedChange={(v) => setFullSettlement(v === true)} />
            This payment settles the invoice in full (full and final)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || totalSettled <= 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Record Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
