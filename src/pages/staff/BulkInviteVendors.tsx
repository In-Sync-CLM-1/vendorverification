import { useState, useRef } from "react";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Send,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Mail,
} from "lucide-react";
import Papa from "papaparse";

const CSV_COLUMNS = ["company_name", "contact_email", "contact_phone", "category_name"];

interface ParsedRow {
  company_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category_name?: string;
}

interface FailedRow {
  row_number: number;
  company_name: string;
  errors: string[];
}

interface InviteResult {
  success_count: number;
  failed_rows: FailedRow[];
}

function downloadTemplate() {
  const exampleRow = "Acme Supplies Pvt Ltd,john@acme.com,9876543210,Supplier";
  const csv = CSV_COLUMNS.join(",") + "\n" + exampleRow;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vendor_invite_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkInviteVendors() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setResult(null);
    setParsedRows([]);

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError("Could not parse the CSV file. Please use the template.");
          return;
        }
        if (results.data.length === 0) {
          setParseError("The CSV file has no data rows.");
          return;
        }
        if (results.data.length > 200) {
          setParseError("Maximum 200 invitations per batch. Please split your file.");
          return;
        }
        setParsedRows(results.data);
      },
      error: () => setParseError("Failed to read the file. Ensure it is a valid CSV."),
    });
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!parsedRows.length) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data, error } = await supabase.functions.invoke("bulk-invite-vendors", {
        body: { rows: parsedRows },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setResult(data as InviteResult);
      const r = data as InviteResult;
      if (r.success_count > 0) {
        toast.success(`${r.success_count} invitation${r.success_count !== 1 ? "s" : ""} sent successfully`);
      }
      if (r.failed_rows.length > 0) {
        toast.warning(`${r.failed_rows.length} row(s) had errors`);
      }
    } catch (err: any) {
      toast.error(err.message || "Bulk invite failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setParsedRows([]);
    setFileName(null);
    setParseError(null);
    setResult(null);
  };

  const previewRows = parsedRows.slice(0, 10);

  return (
    <StaffLayout title="Bulk Invite Vendors">
      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-5xl">
        {/* Instructions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Bulk Vendor Invitations
            </CardTitle>
            <CardDescription>
              Upload a CSV of contacts to invite multiple vendors at once. Each row is sent a secure
              self-registration link <strong>by email and WhatsApp</strong> — vendors fill in their own
              details and upload their own documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download CSV Template
              </Button>
              {!result && (
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                  <FileText className="h-4 w-4 mr-2" />
                  {fileName ? "Change File" : "Select CSV File"}
                </Button>
              )}
              {result && (
                <Button variant="outline" onClick={handleReset}>
                  Invite Another Batch
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>

            {fileName && !parseError && (
              <p className="text-sm text-muted-foreground">
                <FileText className="h-3.5 w-3.5 inline mr-1" />
                {fileName} — {parsedRows.length} contact{parsedRows.length !== 1 ? "s" : ""} found
              </p>
            )}
            {parseError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        {parsedRows.length > 0 && !result && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Preview{parsedRows.length > 10 ? ` (first 10 of ${parsedRows.length} contacts)` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Company Name</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 max-w-[200px] truncate">{row.company_name}</td>
                      <td className="px-3 py-1.5 max-w-[180px] truncate">{row.contact_email}</td>
                      <td className="px-3 py-1.5">{row.contact_phone}</td>
                      <td className="px-3 py-1.5">{row.category_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
            <div className="p-4 border-t">
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending {parsedRows.length} invitations…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send {parsedRows.length} Invitation{parsedRows.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-3">
            {result.success_count > 0 && (
              <Card className="border-green-500/30 bg-green-50/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-700">
                      {result.success_count} invitation{result.success_count !== 1 ? "s" : ""} sent
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" /> Each contact received a self-registration link by email and WhatsApp.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {result.failed_rows.length > 0 && (
              <Card className="border-destructive/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <XCircle className="h-5 w-5" />
                    {result.failed_rows.length} row{result.failed_rows.length !== 1 ? "s" : ""} failed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium w-12">Row</th>
                        <th className="text-left px-3 py-2 font-medium">Company Name</th>
                        <th className="text-left px-3 py-2 font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed_rows.map((row) => (
                        <tr key={row.row_number} className="border-b last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">{row.row_number}</td>
                          <td className="px-3 py-2">{row.company_name || "—"}</td>
                          <td className="px-3 py-2 text-destructive">{row.errors.join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
