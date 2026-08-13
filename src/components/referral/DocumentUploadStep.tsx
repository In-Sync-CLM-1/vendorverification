import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentCapture } from "@/components/vendor/DocumentCapture";
import { FileText, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CategoryDoc {
  id: string;
  document_type_id: string;
  is_mandatory: boolean;
  document_types: {
    id: string;
    name: string;
    description: string | null;
    accepted_formats: string[] | null;
    max_file_size_mb: number | null;
  };
}

interface DocumentUploadStepProps {
  categoryDocs: CategoryDoc[];
  token: string;
  uploadedDocs: Set<string>;
  onDocUploaded: (documentTypeId: string, filePath: string, fileName: string, fileSize: number) => void;
}

export function DocumentUploadStep({ categoryDocs, token, uploadedDocs, onDocUploaded }: DocumentUploadStepProps) {
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [reuploadDocId, setReuploadDocId] = useState<string | null>(null);

  const handleUpload = async (documentTypeId: string, file: File) => {
    setUploadingDocId(documentTypeId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("token", token);
      formData.append("document_type_id", documentTypeId);

      const { data, error } = await supabase.functions.invoke("upload-referral-document", {
        body: formData,
      });

      if (error) throw error;
      onDocUploaded(documentTypeId, data.file_path, file.name, file.size);
      setReuploadDocId(null);
      toast.success("Document uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingDocId(null);
    }
  };

  return (
    <div className="space-y-4 p-8">
      <p className="text-base text-muted-foreground">
        Upload required documents. Supported: PDF, JPG, PNG (max 20MB)
      </p>

      <div className="space-y-4">
        {categoryDocs.map((doc) => {
          const isUploaded = uploadedDocs.has(doc.document_type_id);
          const isUploading = uploadingDocId === doc.document_type_id;
          const showReupload = reuploadDocId === doc.document_type_id;

          return (
            <Card
              key={doc.id}
              className={cn(
                "transition-colors",
                isUploaded && !showReupload && "border-accent bg-accent/5"
              )}
            >
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="text-base font-medium truncate">{doc.document_types.name}</span>
                  {doc.is_mandatory && <span className="text-destructive text-sm">*</span>}
                  {isUploaded && !showReupload && (
                    <CheckCircle2 className="h-5 w-5 text-accent ml-auto shrink-0" />
                  )}
                </div>

                {isUploaded && !showReupload ? (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-accent font-medium">Uploaded successfully</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-sm px-2 text-muted-foreground"
                      onClick={() => setReuploadDocId(doc.document_type_id)}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Re-upload
                    </Button>
                  </div>
                ) : (
                  <>
                    <DocumentCapture
                      onCapture={(file) => handleUpload(doc.document_type_id, file)}
                      disabled={isUploading}
                    />
                    {isUploading && (
                      <div className="flex items-center justify-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                    {showReupload && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-sm px-2 mt-1 text-muted-foreground"
                        onClick={() => setReuploadDocId(null)}
                      >
                        Cancel
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
