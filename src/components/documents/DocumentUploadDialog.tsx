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
import { DocumentCapture } from "@/components/vendor/DocumentCapture";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload } from "lucide-react";

// A document_id of null means this document type has never been uploaded —
// the dialog inserts a new vendor_documents row instead of updating one.
export interface DocumentActionTarget {
  document_id: string | null;
  vendor_id: string;
  tenant_id: string;
  document_type_id: string;
  document_type_name: string;
  version_number: number;
  review_comments: string | null;
}

interface DocumentUploadDialogProps {
  document: DocumentActionTarget | null;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 120);
}

export function DocumentUploadDialog({ document, onOpenChange, onUploaded }: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const isReupload = !!document?.document_id;

  const handleSubmit = async () => {
    if (!document || !file) return;
    setSaving(true);
    try {
      const path = `${document.vendor_id}/${document.document_type_id}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("vendor-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      let newDocumentId = document.document_id;

      if (document.document_id) {
        const { error: updateError } = await supabase
          .from("vendor_documents")
          .update({
            file_url: path,
            file_name: file.name,
            file_size_bytes: file.size,
            version_number: document.version_number + 1,
            status: "uploaded",
            reviewed_by: null,
            reviewed_at: null,
            review_comments: null,
          })
          .eq("id", document.document_id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("vendor_documents")
          .insert({
            vendor_id: document.vendor_id,
            tenant_id: document.tenant_id,
            document_type_id: document.document_type_id,
            file_url: path,
            file_name: file.name,
            file_size_bytes: file.size,
            status: "uploaded",
          })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        newDocumentId = inserted.id;
      }

      if (newDocumentId) {
        supabase.functions
          .invoke("analyze-document", { body: { document_id: newDocumentId } })
          .catch(() => {});
      }

      toast.success(isReupload ? "Document re-uploaded — it's back with the team for review" : "Document uploaded");
      setFile(null);
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!document} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReupload ? "Re-upload" : "Upload"} {document?.document_type_name}</DialogTitle>
          <DialogDescription>
            {document?.review_comments
              ? `Reason: ${document.review_comments}`
              : isReupload
                ? "Attach a replacement file for this document."
                : "Attach this document."}
          </DialogDescription>
        </DialogHeader>

        <DocumentCapture onCapture={setFile} disabled={saving} />
        {file && (
          <p className="text-xs text-muted-foreground truncate">Selected: {file.name}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!file || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" /> Submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
