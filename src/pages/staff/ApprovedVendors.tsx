import { assertRowsChanged } from "@/lib/writeGuard";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Pencil, Ban, CheckCircle2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUrlState } from "@/hooks/useUrlState";

type VendorRow = {
  id: string;
  vendor_code: string | null;
  company_name: string;
  primary_contact_name: string;
  primary_email: string;
  primary_mobile: string;
  pan_number: string | null;
  approved_at: string | null;
  current_status: string;
};

const ApprovedVendors = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useUrlState("q", "");
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [confirmVendor, setConfirmVendor] = useState<VendorRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<"deactivate" | "reactivate">("deactivate");

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["approved-vendors", showDeactivated],
    queryFn: async () => {
      const statuses = showDeactivated
        ? ["approved", "deactivated"]
        : ["approved"];
      const { data, error } = await supabase
        .from("vendors")
        .select(
          "id, vendor_code, company_name, primary_contact_name, primary_email, primary_mobile, pan_number, approved_at, current_status"
        )
        .in("current_status", statuses as any)
        .order("approved_at", { ascending: false });
      if (error) throw error;
      return (data || []) as VendorRow[];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      vendorId,
      newStatus,
    }: {
      vendorId: string;
      newStatus: string;
    }) => {
      const { data, error } = await supabase
        .from("vendors")
        .update({ current_status: newStatus as any })
        .eq("id", vendorId)
        .select("id");
      if (error) throw error;
      assertRowsChanged(data, "The status change");
    },
    onSuccess: (_, variables) => {
      const action = variables.newStatus === "deactivated" ? "deactivated" : "reactivated";
      toast({ title: `Vendor ${action} successfully` });
      queryClient.invalidateQueries({ queryKey: ["approved-vendors"] });
      setConfirmVendor(null);
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const filtered = vendors.filter(
    (v) =>
      v.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (v.vendor_code || "").toLowerCase().includes(search.toLowerCase()) ||
      v.primary_contact_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleStatusChange = (vendor: VendorRow, action: "deactivate" | "reactivate") => {
    setConfirmVendor(vendor);
    setConfirmAction(action);
  };

  const executeStatusChange = () => {
    if (!confirmVendor) return;
    const newStatus = confirmAction === "deactivate" ? "deactivated" : "approved";
    statusMutation.mutate({ vendorId: confirmVendor.id, newStatus });
  };

  return (
    <StaffLayout title="Approved Vendors">
      <div className="space-y-4">
        {/* Search & filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-deactivated"
              checked={showDeactivated}
              onCheckedChange={setShowDeactivated}
            />
            <Label htmlFor="show-deactivated" className="text-sm text-muted-foreground">
              Show deactivated
            </Label>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>
            {filtered.length} vendor{filtered.length !== 1 ? "s" : ""} found
          </span>
        </div>

        {/* Table */}
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Code</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Mobile</TableHead>
                <TableHead>Approved Date</TableHead>
                <TableHead className="hidden lg:table-cell">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading vendors...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No vendors found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((vendor) => (
                  <TableRow
                    key={vendor.id}
                    className={vendor.current_status === "deactivated" ? "opacity-60" : ""}
                  >
                    <TableCell className="font-mono text-xs">
                      {vendor.vendor_code || "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {vendor.company_name}
                    </TableCell>
                    <TableCell>{vendor.primary_contact_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {vendor.primary_email}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {vendor.primary_mobile}
                    </TableCell>
                    <TableCell className="text-sm">
                      {vendor.approved_at
                        ? format(new Date(vendor.approved_at), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge
                        variant={
                          vendor.current_status === "approved"
                            ? "default"
                            : "secondary"
                        }
                        className={
                          vendor.current_status === "approved"
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-red-100 text-red-800 hover:bg-red-100"
                        }
                      >
                        {vendor.current_status === "approved"
                          ? "Active"
                          : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            navigate(`/staff/vendor/${vendor.id}`)
                          }
                          title="Edit / View"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {vendor.current_status === "approved" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusChange(vendor, "deactivate")}
                            title="Deactivate"
                            className="text-destructive hover:text-destructive"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusChange(vendor, "reactivate")}
                            title="Reactivate"
                            className="text-green-600 hover:text-green-700"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={!!confirmVendor}
        onOpenChange={(open) => !open && setConfirmVendor(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "deactivate" ? "Deactivate" : "Reactivate"} Vendor
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction}{" "}
              <strong>{confirmVendor?.company_name}</strong>
              {confirmAction === "deactivate"
                ? "? They will no longer be active in the system."
                : "? They will be restored to active status."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeStatusChange}
              className={
                confirmAction === "deactivate"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmAction === "deactivate" ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StaffLayout>
  );
};

export default ApprovedVendors;
