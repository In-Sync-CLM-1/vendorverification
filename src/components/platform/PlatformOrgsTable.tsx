import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Trash2,
  Power,
  PowerOff,
  CalendarPlus,
  Loader2,
  Search,
} from "lucide-react";
import {
  PLATFORM_DEFAULT_TENANT,
  type OrgRow,
} from "@/hooks/usePlatformDashboard";

interface Props {
  orgs: OrgRow[];
  ownTenantId: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  trial: "Trial",
  active: "Paid",
  past_due: "Past Due",
  cancelled: "Cancelled",
  expired: "Expired",
};

function statusBadgeVariant(status: string | null, isActive: boolean): {
  label: string;
  className: string;
} {
  if (!isActive) {
    return { label: "Disabled", className: "bg-muted text-muted-foreground" };
  }
  if (!status) return { label: "—", className: "bg-muted text-muted-foreground" };
  switch (status) {
    case "active":
      return { label: "Paid", className: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" };
    case "trial":
      return { label: "Trial", className: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" };
    case "past_due":
      return { label: "Past Due", className: "bg-accent/15 text-accent" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground" };
    case "expired":
      return { label: "Expired", className: "bg-destructive/10 text-destructive" };
    default:
      return { label: STATUS_LABEL[status] ?? status, className: "bg-muted text-muted-foreground" };
  }
}

export function PlatformOrgsTable({ orgs, ownTenantId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);
  const [deleteSlug, setDeleteSlug] = useState("");

  const [extendTarget, setExtendTarget] = useState<OrgRow | null>(null);
  const [extendDays, setExtendDays] = useState("14");

  const filtered = orgs.filter((o) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q);
  });

  const isProtected = (o: OrgRow) =>
    o.id === PLATFORM_DEFAULT_TENANT || o.id === ownTenantId;

  const setActiveMutation = useMutation({
    mutationFn: async ({ tenantId, active }: { tenantId: string; active: boolean }) => {
      const { data, error } = await supabase.functions.invoke("manage-organization", {
        body: { action: active ? "enable" : "disable", tenant_id: tenantId },
      });
      if (error) throw new Error(error.message ?? "Failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any, vars) => {
      if (vars.active) {
        toast.success("Organization enabled");
      } else {
        toast.success(
          `Organization disabled. ${data?.sessions_terminated ?? 0} active session${data?.sessions_terminated === 1 ? "" : "s"} terminated.`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["platform-dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-organization", {
        body: { tenant_id: tenantId },
      });
      if (error) throw new Error(error.message ?? "Failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Organization deleted. Removed ${data?.files_removed ?? 0} file${data?.files_removed === 1 ? "" : "s"} and ${data?.users_removed ?? 0} user account${data?.users_removed === 1 ? "" : "s"}.`
      );
      setDeleteTarget(null);
      setDeleteSlug("");
      queryClient.invalidateQueries({ queryKey: ["platform-dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const extendMutation = useMutation({
    mutationFn: async ({ tenantId, days }: { tenantId: string; days: number }) => {
      const { data, error } = await supabase.functions.invoke("manage-organization", {
        body: { action: "extend_trial", tenant_id: tenantId, additional_days: days },
      });
      if (error) throw new Error(error.message ?? "Failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Trial extended to ${data?.new_end ?? "new date"}.`);
      setExtendTarget(null);
      setExtendDays("14");
      queryClient.invalidateQueries({ queryKey: ["platform-dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-bold">All Organizations</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {orgs.length} customer organization{orgs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Vendors</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                    {orgs.length === 0 ? "No organizations yet" : "No matches"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => {
                  const badge = statusBadgeVariant(org.status, org.is_active);
                  const totalUsers = org.staff_count + org.vendor_user_count;
                  const protectedOrg = isProtected(org);
                  const canExtend = org.is_active && org.status === "trial" && !protectedOrg;
                  return (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div className="font-semibold text-foreground">{org.name}</div>
                        <div className="text-[11px] text-muted-foreground">{org.slug}</div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {org.plan ? org.plan.replace(/_/g, " ") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${badge.className} hover:${badge.className} font-medium`}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{totalUsers}</TableCell>
                      <TableCell className="text-right text-sm">{org.vendor_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(org.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canExtend && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10"
                              onClick={() => {
                                setExtendTarget(org);
                                setExtendDays("14");
                              }}
                              title="Extend trial"
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            disabled={protectedOrg || setActiveMutation.isPending}
                            title={
                              protectedOrg
                                ? "Cannot toggle this organization"
                                : org.is_active
                                ? "Disable organization"
                                : "Enable organization"
                            }
                            onClick={() =>
                              setActiveMutation.mutate({
                                tenantId: org.id,
                                active: !org.is_active,
                              })
                            }
                          >
                            {org.is_active ? (
                              <PowerOff className="h-4 w-4 text-destructive" />
                            ) : (
                              <Power className="h-4 w-4 text-[hsl(var(--success))]" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-destructive hover:bg-destructive/10"
                            disabled={protectedOrg}
                            title={protectedOrg ? "Cannot delete this organization" : "Delete organization"}
                            onClick={() => {
                              setDeleteTarget(org);
                              setDeleteSlug("");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Extend trial dialog */}
      <Dialog
        open={!!extendTarget}
        onOpenChange={(open) => {
          if (!open) {
            setExtendTarget(null);
            setExtendDays("14");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend trial for {extendTarget?.name}</DialogTitle>
            <DialogDescription>
              Pushes the trial end date forward. Subscription stays in trial state until either you
              change it or the new end date is reached.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              Current trial ends:{" "}
              <span className="font-medium text-foreground">
                {extendTarget?.trial_end ? format(new Date(extendTarget.trial_end), "dd MMM yyyy") : "—"}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="extend-days">Extend by (days)</Label>
              <Input
                id="extend-days"
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
              />
              <div className="flex gap-2 pt-1">
                {[7, 14, 30, 60].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={extendDays === String(d) ? "default" : "outline"}
                    onClick={() => setExtendDays(String(d))}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExtendTarget(null)}
              disabled={extendMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={
                extendMutation.isPending ||
                !extendTarget ||
                !Number.isFinite(parseInt(extendDays)) ||
                parseInt(extendDays) < 1 ||
                parseInt(extendDays) > 365
              }
              onClick={() => {
                if (extendTarget) {
                  extendMutation.mutate({
                    tenantId: extendTarget.id,
                    days: parseInt(extendDays),
                  });
                }
              }}
            >
              {extendMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extending…
                </>
              ) : (
                "Extend trial"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteSlug("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will permanently delete <strong>{deleteTarget?.name}</strong> and everything in it:
                </p>
                <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                  <li>
                    {(deleteTarget?.staff_count ?? 0) + (deleteTarget?.vendor_user_count ?? 0)} user account
                    {(deleteTarget?.staff_count ?? 0) + (deleteTarget?.vendor_user_count ?? 0) === 1 ? "" : "s"}
                  </li>
                  <li>
                    {deleteTarget?.vendor_count ?? 0} vendor
                    {deleteTarget?.vendor_count === 1 ? "" : "s"} and all their documents
                  </li>
                  <li>All workflow history, notifications, audit logs</li>
                  <li>Subscription, billing, API keys, webhook config</li>
                </ul>
                <p className="text-destructive font-medium">This cannot be undone.</p>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="confirm-slug" className="text-xs">
                    Type{" "}
                    <code className="font-mono bg-muted px-1 rounded">{deleteTarget?.slug}</code>{" "}
                    to confirm
                  </Label>
                  <Input
                    id="confirm-slug"
                    autoComplete="off"
                    value={deleteSlug}
                    onChange={(e) => setDeleteSlug(e.target.value)}
                    placeholder={deleteTarget?.slug}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                !deleteTarget ||
                deleteSlug !== deleteTarget.slug ||
                deleteMutation.isPending
              }
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete organization"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
