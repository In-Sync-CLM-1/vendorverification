import { Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { downloadInvoiceFile, openInvoiceFile } from "@/lib/invoices";

const extOf = (key: string) => {
  const i = key.lastIndexOf(".");
  return i > key.lastIndexOf("/") && i >= 0 ? key.slice(i) : ".pdf";
};

const iconBtn =
  "inline-grid h-6 w-6 place-items-center rounded-md border border-border bg-background text-primary hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

/** An eye to view a stored document and, when allowed, an arrow to download it. */
export function FileActions({
  fileKey,
  label,
  downloadName,
  download = true,
}: {
  fileKey: string | null | undefined;
  label: string;
  downloadName: string;
  download?: boolean;
}) {
  if (!fileKey) return null;
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not open the file");
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <button
        type="button"
        className={iconBtn}
        title={`View ${label}`}
        aria-label={`View ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          openInvoiceFile(fileKey).catch(fail);
        }}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      {download && (
        <button
          type="button"
          className={iconBtn}
          title={`Download ${label}`}
          aria-label={`Download ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            downloadInvoiceFile(fileKey, `${downloadName.replace(/[\\/]/g, "-")}${extOf(fileKey)}`).catch(fail);
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
