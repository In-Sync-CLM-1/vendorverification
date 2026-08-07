import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ClipboardCheck, Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatINR, openInvoiceFile } from "@/lib/invoices";

interface PiQuotation {
  id: string;
  document_type: "proforma_invoice" | "quotation";
  file_key: string;
  project_name: string;
  amount: number | null;
  vendor_remarks: string | null;
  status: "submitted" | "approved" | "rejected";
  review_comments: string | null;
  created_at: string;
  vendors: { company_name: string; vendor_code: string | null } | null;
}

export default function ProjectOwnerApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["project-owner-pi-quotations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_pi_quotations")
        .select("*, vendors(company_name, vendor_code)")
        .eq("project_owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PiQuotation[];
    },
    enabled: !!user?.id,
  });

  const pending = submissions.filter((s) => s.status === "submitted");
  const decided = submissions.filter((s) => s.status !== "submitted");

  const handleView = async (fileKey: string) => {
    try {
      await openInvoiceFile(fileKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const handleDecide = async (submission: PiQuotation, approve: boolean) => {
    setActioningId(submission.id);
    try {
      const { error } = await supabase
        .from("vendor_pi_quotations")
        .update({
          status: approve ? "approved" : "rejected",
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_comments: comments[submission.id]?.trim() || null,
        })
        .eq("id", submission.id);
      if (error) throw new Error(error.message);

      toast.success(approve ? "Approved" : "Rejected");
      queryClient.invalidateQueries({ queryKey: ["project-owner-pi-quotations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <StaffLayout title="PI / Quotation Approvals">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">PI / Quotation Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Submissions routed to you as the Project Owner for the RMPL project the vendor picked.
            Approving one clears it for Accounts to issue a PO.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : pending.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <ClipboardCheck className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="font-medium">Nothing awaiting your approval</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pending.map((s) => (
                    <div key={s.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{s.vendors?.company_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.vendors?.vendor_code} · {s.project_name} · submitted{" "}
                            {new Date(s.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                          {s.document_type === "quotation" ? "Quotation" : "Proforma Invoice"}
                        </Badge>
                      </div>

                      <div className="bg-muted/40 rounded-md p-3 space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-semibold">{s.amount != null ? formatINR(s.amount) : "Not detected"}</span>
                        </div>
                      </div>

                      {s.vendor_remarks && (
                        <p className="text-sm text-muted-foreground italic">"{s.vendor_remarks}"</p>
                      )}

                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleView(s.file_key)}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> View Document
                      </Button>

                      <div className="space-y-1.5">
                        <Label htmlFor={`comment-${s.id}`} className="text-xs text-muted-foreground">
                          Comment (shown to vendor if rejected)
                        </Label>
                        <Textarea
                          id={`comment-${s.id}`}
                          rows={2}
                          value={comments[s.id] || ""}
                          onChange={(e) => setComments((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder="Optional"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" disabled={actioningId === s.id} onClick={() => handleDecide(s, true)}>
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive"
                          disabled={actioningId === s.id}
                          onClick={() => handleDecide(s, false)}
                        >
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {decided.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b">
                  <h2 className="font-semibold text-sm">Recently Decided</h2>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {decided.slice(0, 20).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <p className="font-medium">{s.vendors?.company_name}</p>
                            <p className="text-xs text-muted-foreground">{s.vendors?.vendor_code}</p>
                          </TableCell>
                          <TableCell className="text-sm">{s.project_name}</TableCell>
                          <TableCell className="text-right">{s.amount != null ? formatINR(s.amount) : "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                s.status === "approved"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : "bg-red-100 text-red-800 border-red-200"
                              }
                            >
                              {s.status === "approved" ? "Approved" : "Rejected"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}
