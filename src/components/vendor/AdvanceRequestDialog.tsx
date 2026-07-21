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
import { Loader2 } from "lucide-react";

interface AdvanceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onSubmitted: () => void;
}

export function AdvanceRequestDialog({ open, onOpenChange, vendorId, onSubmitted }: AdvanceRequestDialogProps) {
  const [amount, setAmount] = useState("");
  const [activityName, setActivityName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setAmount("");
    setActivityName("");
    setRemarks("");
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid advance amount");
    if (!activityName.trim()) return toast.error("Describe the activity this advance is for");

    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("vendor_advance_requests")
        .insert({
          vendor_id: vendorId,
          tenant_id: "00000000-0000-0000-0000-000000000000", // derived server-side from the vendor
          amount: amt,
          activity_name: activityName.trim(),
          vendor_remarks: remarks.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      toast.success("Advance request submitted — the team will review it shortly");

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

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request an Advance</DialogTitle>
          <DialogDescription>
            Each request is reviewed individually — there's no fixed formula. Describe what
            it's for in your own words; the team will match it to the right project on their end.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="adv-amount">Amount (₹) *</Label>
            <Input id="adv-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-activity">Activity Name *</Label>
            <Input id="adv-activity" value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="e.g. Site mobilization for Phase 2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-remarks">Remarks</Label>
            <Textarea id="adv-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Any context that helps the team review this" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>) : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
