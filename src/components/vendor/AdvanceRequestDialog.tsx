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
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdvanceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onSubmitted: () => void;
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

export function AdvanceRequestDialog({ open, onOpenChange, vendorId, onSubmitted }: AdvanceRequestDialogProps) {
  const [amount, setAmount] = useState("");
  const [activityName, setActivityName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const [piFileKey, setPiFileKey] = useState<string | null>(null);
  const [parsingPi, setParsingPi] = useState(false);
  const [piRead, setPiRead] = useState<InvoiceExtraction | null>(null);

  const reset = () => {
    setAmount("");
    setActivityName("");
    setRemarks("");
    setPiFileKey(null);
    setPiRead(null);
  };

  const handlePiFileChange = async (file: File | null) => {
    setPiFileKey(null);
    setPiRead(null);
    if (!file) return;

    setParsingPi(true);
    try {
      const key = await uploadInvoiceFile(file);
      setPiFileKey(key);
      try {
        const result = await analyzeInvoiceFile(key);
        setPiRead(result);
        if (result.invoice_amount != null) setAmount((prev) => prev || String(result.invoice_amount));
        if (result.description) setActivityName((prev) => prev || result.description!);
        toast.success("Proforma invoice read — please review the fields below");
      } catch (err: any) {
        toast.error(err.message || "Could not read this file automatically — please fill in the details below");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setParsingPi(false);
    }
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
          proforma_invoice_file_key: piFileKey,
          ai_extracted_data: piRead ? { proforma_invoice: piRead } : null,
          ai_confidence_score: piRead?.overall_confidence ?? null,
          ai_model_version: piRead?.ai_model_version ?? null,
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

  const busy = saving || parsingPi;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
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
            <Label htmlFor="adv-pi-file">Proforma Invoice (PDF/JPG/PNG, optional)</Label>
            <Input
              id="adv-pi-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={busy}
              onChange={(e) => handlePiFileChange(e.target.files?.[0] || null)}
            />
            {parsingPi && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading proforma invoice…
              </p>
            )}
            {!parsingPi && piRead && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Auto-filled by AI — review before submitting
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <FieldLabel text="Amount (₹) *" confidence={piRead?.invoice_amount_confidence} />
            <Input id="adv-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={parsingPi} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-activity">Activity Name *</Label>
            <Input id="adv-activity" value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="e.g. Site mobilization for Phase 2" disabled={parsingPi} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-remarks">Remarks</Label>
            <Textarea id="adv-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Any context that helps the team review this" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>) : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
