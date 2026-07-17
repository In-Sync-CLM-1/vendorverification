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
import { Loader2, UserCog, Check, X } from "lucide-react";
import { toast } from "sonner";

interface ChangeRequest {
  id: string;
  vendor_id: string;
  status: "pending" | "approved" | "rejected";
  requested_contact_name: string | null;
  requested_email: string | null;
  requested_mobile: string | null;
  requested_bank_account_number: string | null;
  requested_bank_ifsc: string | null;
  vendor_note: string | null;
  created_at: string;
  vendors: { company_name: string; vendor_code: string | null } | null;
}

function FieldDiff({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function StaffDetailChangeRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["staff-change-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_detail_change_requests")
        .select("*, vendors(company_name, vendor_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ChangeRequest[];
    },
  });

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  const handleDecide = async (req: ChangeRequest, approve: boolean) => {
    setActioningId(req.id);
    try {
      if (approve) {
        const updates: Record<string, string> = {};
        if (req.requested_contact_name) updates.primary_contact_name = req.requested_contact_name;
        if (req.requested_email) updates.primary_email = req.requested_email;
        if (req.requested_mobile) updates.primary_mobile = req.requested_mobile;
        if (req.requested_bank_account_number) updates.bank_account_number = req.requested_bank_account_number;
        if (req.requested_bank_ifsc) updates.bank_ifsc = req.requested_bank_ifsc;

        if (Object.keys(updates).length > 0) {
          const { error: vendorErr } = await supabase.from("vendors").update(updates).eq("id", req.vendor_id);
          if (vendorErr) throw new Error(`Could not update vendor record: ${vendorErr.message}`);
        }
      }

      const { error } = await supabase
        .from("vendor_detail_change_requests")
        .update({
          status: approve ? "approved" : "rejected",
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_comments: comments[req.id]?.trim() || null,
        })
        .eq("id", req.id);
      if (error) throw new Error(error.message);

      toast.success(approve ? "Change applied to vendor record" : "Request rejected");
      queryClient.invalidateQueries({ queryKey: ["staff-change-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <StaffLayout title="Detail Change Requests">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Vendor Detail Change Requests</h1>
          <p className="text-sm text-muted-foreground">
            Requests vendors submit from their portal to update bank or contact details.
            Nothing changes on the vendor record until you approve.
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
                  <UserCog className="h-10 w-10 text-muted-foreground mx-auto" />
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

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-muted/40 rounded-md p-3">
                        <FieldDiff label="Contact Name" value={req.requested_contact_name} />
                        <FieldDiff label="Email" value={req.requested_email} />
                        <FieldDiff label="Mobile" value={req.requested_mobile} />
                        <FieldDiff label="Bank Account" value={req.requested_bank_account_number} />
                        <FieldDiff label="IFSC" value={req.requested_bank_ifsc} />
                      </div>

                      {req.vendor_note && (
                        <p className="text-sm text-muted-foreground italic">"{req.vendor_note}"</p>
                      )}

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
                          <Check className="h-4 w-4 mr-1" /> Approve & Apply
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
                        <TableHead>Requested</TableHead>
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
                          <TableCell className="text-xs">
                            {new Date(req.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                req.status === "approved"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : "bg-red-100 text-red-800 border-red-200"
                              }
                            >
                              {req.status === "approved" ? "Applied" : "Rejected"}
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
