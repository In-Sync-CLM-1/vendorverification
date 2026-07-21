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
import { ProjectCombobox } from "@/components/staff/ProjectCombobox";
import { Loader2, HandCoins, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/invoices";

interface AdvanceRequest {
  id: string;
  vendor_id: string;
  amount: number;
  activity_name: string;
  vendor_remarks: string | null;
  status: "pending" | "approved" | "rejected";
  project_id: string | null;
  project_name: string | null;
  review_comments: string | null;
  created_at: string;
  vendors: { company_name: string; vendor_code: string | null } | null;
}

export default function StaffAdvanceRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [projectChoice, setProjectChoice] = useState<Record<string, { id: string; name: string }>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["staff-advance-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_advance_requests")
        .select("*, vendors(company_name, vendor_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AdvanceRequest[];
    },
  });

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  const handleDecide = async (req: AdvanceRequest, approve: boolean) => {
    const project = projectChoice[req.id];
    if (approve && !project) {
      toast.error("Assign this request to a project before approving");
      return;
    }

    setActioningId(req.id);
    try {
      const { error } = await supabase
        .from("vendor_advance_requests")
        .update({
          status: approve ? "approved" : "rejected",
          project_id: approve ? project!.id : null,
          project_name: approve ? project!.name : null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_comments: comments[req.id]?.trim() || null,
        })
        .eq("id", req.id);
      if (error) throw new Error(error.message);

      toast.success(approve ? "Advance request approved" : "Advance request rejected");
      queryClient.invalidateQueries({ queryKey: ["staff-advance-requests"] });

      supabase.functions
        .invoke("notify-vendor-advance-decision", { body: { advance_request_id: req.id } })
        .catch((e) => console.error("Vendor notification failed:", e));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <StaffLayout title="Advance Requests">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Vendor Advance Requests</h1>
          <p className="text-sm text-muted-foreground">
            Advances are judged case by case — there's no fixed policy. Assign an approved
            request to the correct RMPL project (only projects currently in execution are
            shown); it will be adjusted against invoices for that vendor later, the same way
            any other advance is netted off at settlement.
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
                  <HandCoins className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="font-medium">No pending requests</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pending.map((req) => (
                    <div key={req.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{req.vendors?.company_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {req.vendors?.vendor_code} · requested{" "}
                            {new Date(req.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>
                      </div>

                      <div className="bg-muted/40 rounded-md p-3 space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-semibold">{formatINR(Number(req.amount))}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Activity</span>
                          <span className="font-medium">{req.activity_name}</span>
                        </div>
                      </div>

                      {req.vendor_remarks && (
                        <p className="text-sm text-muted-foreground italic">"{req.vendor_remarks}"</p>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Assign to project (required to approve)</Label>
                        <ProjectCombobox
                          value={projectChoice[req.id]?.id || null}
                          valueName={projectChoice[req.id]?.name}
                          onChange={(id, name) => setProjectChoice((prev) => ({ ...prev, [req.id]: { id, name } }))}
                          disabled={actioningId === req.id}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`comment-${req.id}`} className="text-xs text-muted-foreground">
                          Comment (shown to vendor if rejected)
                        </Label>
                        <Textarea
                          id={`comment-${req.id}`}
                          rows={2}
                          value={comments[req.id] || ""}
                          onChange={(e) => setComments((prev) => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder="Optional"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={actioningId === req.id}
                          onClick={() => handleDecide(req, true)}
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive"
                          disabled={actioningId === req.id}
                          onClick={() => handleDecide(req, false)}
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
                        <TableHead>Activity</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {decided.slice(0, 20).map((req) => (
                        <TableRow key={req.id}>
                          <TableCell>
                            <p className="font-medium">{req.vendors?.company_name}</p>
                            <p className="text-xs text-muted-foreground">{req.vendors?.vendor_code}</p>
                          </TableCell>
                          <TableCell className="text-sm">{req.activity_name}</TableCell>
                          <TableCell className="text-right">{formatINR(Number(req.amount))}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{req.project_name || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                req.status === "approved"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : "bg-red-100 text-red-800 border-red-200"
                              }
                            >
                              {req.status === "approved" ? "Approved" : "Rejected"}
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
