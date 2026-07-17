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

interface DetailChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onSubmitted: () => void;
}

export function DetailChangeRequestDialog({ open, onOpenChange, vendorId, onSubmitted }: DetailChangeRequestDialogProps) {
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setContactName("");
    setEmail("");
    setMobile("");
    setBankAccount("");
    setBankIfsc("");
    setNote("");
  };

  const handleSubmit = async () => {
    const fields = {
      requested_contact_name: contactName.trim() || null,
      requested_email: email.trim() || null,
      requested_mobile: mobile.trim() || null,
      requested_bank_account_number: bankAccount.trim() || null,
      requested_bank_ifsc: bankIfsc.trim() || null,
    };
    if (Object.values(fields).every((v) => v === null)) {
      toast.error("Fill in at least one field you want to change");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("vendor_detail_change_requests").insert({
        vendor_id: vendorId,
        tenant_id: "00000000-0000-0000-0000-000000000000", // derived server-side from the vendor
        ...fields,
        vendor_note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
      toast.success("Change request submitted — the team will review it shortly");
      reset();
      onOpenChange(false);
      onSubmitted();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request a Detail Change</DialogTitle>
          <DialogDescription>
            Fill in only what you want to change. A staff member will review and apply it —
            nothing updates on your record until then.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dcr-name">Contact Name</Label>
            <Input id="dcr-name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Leave blank to keep unchanged" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dcr-email">Email</Label>
              <Input id="dcr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Leave blank to keep unchanged" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dcr-mobile">Mobile</Label>
              <Input id="dcr-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Leave blank to keep unchanged" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dcr-bank">Bank Account No.</Label>
              <Input id="dcr-bank" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Leave blank to keep unchanged" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dcr-ifsc">IFSC</Label>
              <Input id="dcr-ifsc" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="Leave blank to keep unchanged" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dcr-note">Note (optional)</Label>
            <Textarea id="dcr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. old number is no longer active" />
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
