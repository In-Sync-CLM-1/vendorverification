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

export interface ReuploadTargetDocument {
  id: string;
  vendor_id: string;
  document_type_id: string;
  document_type_name: string;
  version_number: number;
  review_comments: string | null;
}

interface DocumentReuploadDialogProps {
  document: ReuploadTargetDocument | null;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 120);
}

export function DocumentReuploadDialog({ document, onOpenChange, onUploaded }: DocumentReuploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!document || !file) return;
    setSaving(true);
    try {
      const path = `${document.vendor_id}/${document.document_type_id}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("vendor-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

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
        .eq("id", document.id);
      if (updateError) throw new Error(updateError.message);

      toast.success("Document re-uploaded — it's back with the team for review");
      setFile(null);
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!document} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-upload {document?.document_type_name}</DialogTitle>
          <DialogDescription>
            {document?.review_comments
              ? `Reason: ${document.review_comments}`
              : "Attach a replacement file for this document."}
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
