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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadInvoiceFile, analyzeInvoiceFile, InvoiceExtraction } from "@/lib/invoices";
import { ProjectCombobox, RmplProject } from "@/components/shared/ProjectCombobox";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";

interface PiQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onSubmitted: () => void;
}

export function PiQuotationDialog({ open, onOpenChange, vendorId, onSubmitted }: PiQuotationDialogProps) {
  const [documentType, setDocumentType] = useState<"proforma_invoice" | "quotation">("proforma_invoice");
  const [project, setProject] = useState<RmplProject | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const [fileKey, setFileKey] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);

  const reset = () => {
    setDocumentType("proforma_invoice");
    setProject(null);
    setRemarks("");
    setFileKey(null);
    setExtraction(null);
  };

  const handleFileChange = async (file: File | null) => {
    setFileKey(null);
    setExtraction(null);
    if (!file) return;

    setParsing(true);
    try {
      const key = await uploadInvoiceFile(file);
      setFileKey(key);
      try {
        const result = await analyzeInvoiceFile(key);
        setExtraction(result);
        toast.success("Document read — please review before submitting");
      } catch (err: any) {
        toast.error(err.message || "Could not read this file automatically — please fill in the details below");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!fileKey) return toast.error("Upload the Proforma Invoice or Quotation file");
    if (!project) return toast.error("Select the project this is for");
    if (project.project_owner_user_id === null) {
      return toast.error("This project's owner isn't set up in the portal yet — contact your point of contact");
    }

    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("vendor_pi_quotations")
        .insert({
          vendor_id: vendorId,
          document_type: documentType,
          file_key: fileKey,
          rmpl_project_id: project.id,
          project_number: project.project_number,
          project_name: project.project_name,
          project_owner_external_id: project.project_owner_external_id,
          project_owner_user_id: project.project_owner_user_id,
          project_owner_name: project.project_owner_name,
          project_owner_email: project.project_owner_email,
          document_date: extraction?.invoice_date || null,
          amount: extraction?.invoice_amount ?? null,
          ai_extracted_data: extraction ? { document: extraction } : null,
          ai_confidence_score: extraction?.overall_confidence ?? null,
          ai_model_version: extraction?.ai_model_version ?? null,
          vendor_remarks: remarks.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      toast.success(`${documentType === "quotation" ? "Quotation" : "Proforma Invoice"} submitted — the project owner will review it`);

      reset();
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || parsing;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit PI / Quotation</DialogTitle>
          <DialogDescription>
            Pick the project this is for and upload the document — it goes straight to that
            project's owner for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Document Type *</Label>
            <RadioGroup value={documentType} onValueChange={(v) => setDocumentType(v as typeof documentType)} className="flex gap-4" disabled={busy}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="proforma_invoice" id="doc-pi" />
                <Label htmlFor="doc-pi" className="font-normal cursor-pointer">Proforma Invoice</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="quotation" id="doc-quote" />
                <Label htmlFor="doc-quote" className="font-normal cursor-pointer">Quotation</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Project *</Label>
            <ProjectCombobox
              value={project?.id || null}
              valueName={project?.project_name}
              onChange={setProject}
              disabled={busy}
            />
            {project && project.project_owner_user_id === null ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <TriangleAlert className="h-3 w-3" /> This project's owner isn't set up in the portal yet — you won't be able to submit against it.
              </p>
            ) : project?.project_owner_name ? (
              <p className="text-xs text-muted-foreground">
                Goes to {project.project_owner_name} for approval
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="piq-file">File (PDF/JPG/PNG) *</Label>
            <Input
              id="piq-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={busy}
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
            {parsing && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading document…
              </p>
            )}
            {!parsing && extraction && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Read by AI — {extraction.invoice_amount != null ? `amount ${extraction.invoice_amount}` : "amount not detected"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="piq-remarks">Remarks</Label>
            <Textarea id="piq-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Any context that helps the project owner review this" disabled={busy} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>) : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
