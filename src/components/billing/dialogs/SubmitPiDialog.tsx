import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import type { BillingRow } from "@/lib/billing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  /** Set to fix and resubmit a rejected PI/Quotation on the same row. */
  resubmitRow?: BillingRow | null;
  onDone: () => void;
}

/** Submit a PI / Quotation (a new row), or fix and resubmit a rejected one (the same row). */
export function SubmitPiDialog({ open, onOpenChange, vendorId, resubmitRow, onDone }: Props) {
  const [documentType, setDocumentType] = useState<"proforma_invoice" | "quotation">("proforma_invoice");
  const [project, setProject] = useState<RmplProject | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);

  useEffect(() => {
    if (!open) return;
    setDocumentType(resubmitRow?.doc_stage === "quotation" ? "quotation" : "proforma_invoice");
    setProject(null);
    setRemarks(resubmitRow?.pi_vendor_remarks || "");
    setFileKey(null);
    setExtraction(null);
  }, [open, resubmitRow]);

  const handleFileChange = async (file: File | null) => {
    setFileKey(null);
    setExtraction(null);
    if (!file) return;
    setParsing(true);
    try {
      const key = await uploadInvoiceFile(file);
      setFileKey(key);
      try {
        setExtraction(await analyzeInvoiceFile(key));
        toast.success("Document read. Please review before submitting");
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : "Could not read this file automatically");
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Upload failed. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!fileKey) return toast.error("Upload the Proforma Invoice or Quotation file");
    setSaving(true);
    try {
      const aiData = extraction ? { document: extraction } : null;
      if (resubmitRow) {
        const { error } = await supabase.rpc("resubmit_pi", {
          p_id: resubmitRow.id,
          p_document_type: documentType,
          p_file_key: fileKey,
          p_document_number: extraction?.invoice_number || null,
          p_document_date: extraction?.invoice_date || null,
          p_amount: extraction?.invoice_amount ?? null,
          p_remarks: remarks.trim() || null,
          p_ai_data: aiData as never,
          p_ai_confidence: extraction?.overall_confidence ?? null,
          p_ai_model: extraction?.ai_model_version ?? null,
        });
        if (error) throw new Error(error.message);
        supabase.functions.invoke("notify-pi-quotation-submitted", { body: { row_id: resubmitRow.id } }).catch(() => {});
        toast.success("Resubmitted. The project owner will review it again");
      } else {
        if (!project) return toast.error("Select the project this is for");
        if (project.project_owner_user_id === null) {
          return toast.error("This project's owner isn't set up in the portal yet. Contact your point of contact");
        }
        const { data: inserted, error } = await supabase
          .from("vendor_invoices")
          .insert({
            vendor_id: vendorId,
            // set by the database from the vendor; required by the insert type only
            tenant_id: "00000000-0000-0000-0000-000000000000",
            doc_stage: documentType,
            pi_file_key: fileKey,
            rmpl_project_id: project.id,
            project_number: project.project_number,
            project_name: project.project_name,
            project_owner_external_id: project.project_owner_external_id,
            project_owner_user_id: project.project_owner_user_id,
            project_owner_name: project.project_owner_name,
            project_owner_email: project.project_owner_email,
            pi_document_date: extraction?.invoice_date || null,
            pi_document_number: extraction?.invoice_number || null,
            pi_amount: extraction?.invoice_amount ?? null,
            pi_ai_extracted_data: aiData as never,
            pi_ai_confidence_score: extraction?.overall_confidence ?? null,
            pi_ai_model_version: extraction?.ai_model_version ?? null,
            pi_vendor_remarks: remarks.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        supabase.functions.invoke("notify-pi-quotation-submitted", { body: { row_id: inserted.id } }).catch(() => {});
        toast.success(`${documentType === "quotation" ? "Quotation" : "Proforma Invoice"} submitted. The project owner will review it`);
      }
      onOpenChange(false);
      onDone();
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
          <DialogTitle>{resubmitRow ? "Fix and resubmit" : "Submit PI / Quotation"}</DialogTitle>
          <DialogDescription>
            {resubmitRow
              ? `The project owner said: “${resubmitRow.pi_review_comments || "please correct and resubmit"}”. Upload the corrected file.`
              : "Pick the project this is for and upload the document. It goes straight to that project's owner for approval."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Document Type *</Label>
            <RadioGroup value={documentType} onValueChange={(v) => setDocumentType(v as typeof documentType)} className="flex gap-4" disabled={busy}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="proforma_invoice" id="doc-pi" />
                <Label htmlFor="doc-pi" className="cursor-pointer font-normal">Proforma Invoice</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="quotation" id="doc-quote" />
                <Label htmlFor="doc-quote" className="cursor-pointer font-normal">Quotation</Label>
              </div>
            </RadioGroup>
          </div>

          {resubmitRow ? (
            <div className="rounded-md border bg-muted/40 p-2.5 text-sm">
              <b>{resubmitRow.project_number}</b> · {resubmitRow.project_name}
              <p className="text-xs text-muted-foreground">Approver: {resubmitRow.project_owner_name}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <ProjectCombobox value={project?.id || null} valueName={project?.project_name} onChange={setProject} disabled={busy} />
              {project && project.project_owner_user_id === null ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <TriangleAlert className="h-3 w-3" /> This project's owner isn't set up in the portal yet. You won't be able to submit against it.
                </p>
              ) : project?.project_owner_name ? (
                <p className="text-xs text-muted-foreground">Goes to {project.project_owner_name} for approval</p>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="piq-file">File (PDF/JPG/PNG) *</Label>
            <Input id="piq-file" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
            {parsing && (<p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading document…</p>)}
            {!parsing && extraction && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <Sparkles className="h-3 w-3" /> Read by AI: {extraction.invoice_number ? `number ${extraction.invoice_number}, ` : ""}{extraction.invoice_amount != null ? `amount ${extraction.invoice_amount}` : "amount not detected"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="piq-remarks">Remarks</Label>
            <Textarea id="piq-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Any context that helps the project owner review this" disabled={busy} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy} className={resubmitRow ? "bg-amber-700 text-white hover:bg-amber-800" : ""}>
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>) : resubmitRow ? "Resubmit" : "Submit PI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
