import { useState } from "react";
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
import { Loader2, TriangleAlert, FileCheck } from "lucide-react";

interface PendingAdvanceRequest {
  id: string;
  amount: number;
  activity_name: string;
  created_at: string;
}

interface ApprovedPi {
  id: string;
  document_type: "proforma_invoice" | "quotation";
  project_name: string;
  amount: number | null;
}

interface AdvanceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onSubmitted: () => void;
  // Requests still awaiting a decision — shown so the vendor doesn't submit
  // a duplicate for something they already asked for (this is exactly how
  // a real double-submission happened: no visibility into a still-pending
  // request led to resubmitting the next day).
  pendingRequests?: PendingAdvanceRequest[];
}

export function AdvanceRequestDialog({ open, onOpenChange, vendorId, onSubmitted, pendingRequests = [] }: AdvanceRequestDialogProps) {
  const [piQuotationId, setPiQuotationId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  // Advances are issued against an approved PI/Quotation — the vendor picks
  // one of their own instead of typing a fresh description and re-uploading
  // a document the app already has.
  const { data: approvedPis = [], isLoading: loadingPis } = useQuery({
    queryKey: ["vendor-approved-pi-quotations", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_pi_quotations")
        .select("id, document_type, project_name, amount")
        .eq("vendor_id", vendorId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ApprovedPi[];
    },
    enabled: open && !!vendorId,
  });

  // How much of each PI has already been asked for (pending or approved) —
  // the same ceiling the server enforces, shown up front so the vendor isn't
  // surprised by a rejection.
  const { data: requestedByPi = {} } = useQuery({
    queryKey: ["vendor-advance-requested-by-pi", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_advance_requests")
        .select("pi_quotation_id, amount, status")
        .eq("vendor_id", vendorId)
        .neq("status", "rejected");
      if (error) throw error;
      return (data || []).reduce<Record<string, number>>((acc, r) => {
        if (r.pi_quotation_id) acc[r.pi_quotation_id] = (acc[r.pi_quotation_id] || 0) + Number(r.amount || 0);
        return acc;
      }, {});
    },
    enabled: open && !!vendorId,
  });

  const selectedPi = approvedPis.find((p) => p.id === piQuotationId) || null;
  const alreadyRequested = selectedPi ? requestedByPi[selectedPi.id] || 0 : 0;
  const available = selectedPi?.amount != null ? Math.max(selectedPi.amount - alreadyRequested, 0) : null;

  const reset = () => {
    setPiQuotationId(null);
    setAmount("");
    setRemarks("");
  };

  const handleSubmit = async () => {
    if (!piQuotationId) return toast.error("Select the PI/Quotation this advance is against");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid advance amount");
    if (available != null && amt > available + 1) {
      return toast.error(`This advance cannot exceed ${formatINR(available)} — the balance left on this PI`);
    }

    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("vendor_advance_requests")
        .insert({
          vendor_id: vendorId,
          tenant_id: "00000000-0000-0000-0000-000000000000", // derived server-side from the vendor
          pi_quotation_id: piQuotationId,
          amount: amt,
          // activity_name / project fields are derived server-side from the linked PI
          vendor_remarks: remarks.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      toast.success("Advance request submitted — the project owner will review it shortly");

      if (inserted?.id) {
        supabase.functions
          .invoke("notify-advance-request-submitted", { body: { advance_request_id: inserted.id } })
          .catch(() => {
            // Notification failure shouldn't block the vendor's submission
          });
      }

      reset();
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || loadingPis;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request an Advance</DialogTitle>
          <DialogDescription>
            Advances are issued against an approved PI or Quotation, up to what's left of its
            approved value. It goes to the same project owner who approved that document.
          </DialogDescription>
        </DialogHeader>

        {pendingRequests.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1.5">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" /> You already have {pendingRequests.length === 1 ? "a request" : `${pendingRequests.length} requests`} awaiting review
            </p>
            <div className="space-y-1">
              {pendingRequests.map((r) => (
                <p key={r.id} className="text-xs text-amber-700 dark:text-amber-500">
                  {r.activity_name} · {formatINR(Number(r.amount))} · {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </p>
              ))}
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-500">
              Only submit again if this is against a different PI — no need to resend the same request.
            </p>
          </div>
        )}

        {!loadingPis && approvedPis.length === 0 ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground flex items-center gap-1.5">
              <FileCheck className="h-4 w-4" /> No approved PI/Quotation yet
            </p>
            <p>Submit a PI or Quotation and get it approved before requesting an advance against it.</p>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>PI / Quotation *</Label>
              <Select value={piQuotationId ?? undefined} onValueChange={setPiQuotationId} disabled={busy}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={loadingPis ? "Loading…" : "Select an approved PI/Quotation"} />
                </SelectTrigger>
                <SelectContent>
                  {approvedPis.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.document_type === "quotation" ? "Quotation" : "Proforma Invoice"} · {p.project_name}
                      {p.amount != null ? ` · ${formatINR(p.amount)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPi && (
                <p className="text-xs text-muted-foreground">
                  {available != null
                    ? `Available to request: ${formatINR(available)}`
                    : "This PI has no detected amount — enter the advance amount manually"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adv-amount">Amount (₹) *</Label>
              <Input
                id="adv-amount"
                type="number"
                min="0"
                max={available ?? undefined}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={!selectedPi}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-remarks">Remarks</Label>
              <Textarea id="adv-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Any context that helps the project owner review this" disabled={!selectedPi} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !selectedPi}>
            {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>) : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
