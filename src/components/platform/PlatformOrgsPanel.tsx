import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Building2, Loader2, Trash2, Users, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PLATFORM_DEFAULT_TENANT = "a0000000-0000-0000-0000-000000000001";

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  created_at: string;
  is_active: boolean;
  staff_count: number;
  vendor_count: number;
};

export function PlatformOrgsPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmTarget, setConfirmTarget] = useState<OrgRow | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data: ownTenantId } = useQuery({
    queryKey: ["platform-own-tenant", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.tenant_id ?? null;
    },
    enabled: !!user,
  });

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["platform-orgs"],
    queryFn: async (): Promise<OrgRow[]> => {
      const { data: tenants, error } = await supabase
        .from("tenants")
        .select("id, slug, name, short_name, created_at, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (tenants ?? []).map((t) => t.id);
      if (ids.length === 0) return [];

      const [profilesRes, vendorsRes] = await Promise.all([
        supabase.from("profiles").select("tenant_id").in("tenant_id", ids),
        supabase.from("vendors").select("tenant_id").in("tenant_id", ids),
      ]);

      const staffByTenant: Record<string, number> = {};
      for (const p of profilesRes.data ?? []) {
        staffByTenant[p.tenant_id] = (staffByTenant[p.tenant_id] ?? 0) + 1;
      }
      const vendorsByTenant: Record<string, number> = {};
      for (const v of vendorsRes.data ?? []) {
        vendorsByTenant[v.tenant_id] = (vendorsByTenant[v.tenant_id] ?? 0) + 1;
      }

      return (tenants ?? []).map((t) => ({
        ...t,
        staff_count: staffByTenant[t.id] ?? 0,
        vendor_count: vendorsByTenant[t.id] ?? 0,
      }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-organization", {
        body: { tenant_id: tenantId },
      });
      if (error) throw new Error(error.message ?? "Failed to delete organization");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Organization deleted. Removed ${data?.files_removed ?? 0} file${
          data?.files_removed === 1 ? "" : "s"
        } and ${data?.users_removed ?? 0} user account${data?.users_removed === 1 ? "" : "s"}.`
      );
      setConfirmTarget(null);
      setConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["platform-orgs"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete organization");
    },
  });

  const canDelete = (org: OrgRow) =>
    org.id !== PLATFORM_DEFAULT_TENANT && org.id !== ownTenantId;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Organizations
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Platform-wide tenant management
          </p>
        </div>
        {orgs && (
          <span className="text-xs text-muted-foreground">
            {orgs.length} total
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {orgs?.map((org) => {
            const protectedOrg = !canDelete(org);
            return (
              <div
                key={org.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-border bg-background/60"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {org.name}
                    </p>
                    {!org.is_active && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {org.slug} · created {format(new Date(org.created_at), "dd MMM yyyy")}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {org.staff_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileCheck className="h-3.5 w-3.5" />
                    {org.vendor_count}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={protectedOrg}
                  title={
                    protectedOrg
                      ? org.id === PLATFORM_DEFAULT_TENANT
                        ? "Platform default org cannot be deleted"
                        : "You cannot delete the org you belong to"
                      : "Delete organization"
                  }
                  onClick={() => {
                    setConfirmTarget(org);
                    setConfirmText("");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {orgs?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No organizations
            </p>
          )}
        </div>
      )}

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will permanently delete <strong>{confirmTarget?.name}</strong>{" "}
                  and everything in it:
                </p>
                <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                  <li>
                    {confirmTarget?.staff_count ?? 0} staff member
                    {confirmTarget?.staff_count === 1 ? "" : "s"}
                  </li>
                  <li>
                    {confirmTarget?.vendor_count ?? 0} vendor
                    {confirmTarget?.vendor_count === 1 ? "" : "s"} and all their documents
                  </li>
                  <li>All workflow history, notifications, and audit logs</li>
                  <li>Subscription, billing, API keys, webhook config</li>
                </ul>
                <p className="text-destructive font-medium">
                  This cannot be undone.
                </p>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="confirm-slug" className="text-xs">
                    Type <code className="font-mono bg-muted px-1 rounded">{confirmTarget?.slug}</code> to confirm
                  </Label>
                  <Input
                    id="confirm-slug"
                    autoComplete="off"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={confirmTarget?.slug}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                !confirmTarget ||
                confirmText !== confirmTarget.slug ||
                deleteMutation.isPending
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirmTarget) deleteMutation.mutate(confirmTarget.id);
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
    </div>
  );
}
