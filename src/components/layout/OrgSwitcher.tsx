import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";

/**
 * Switches which organisation you are working in.
 *
 * Mirrors the switcher in Work-Sync and GlobalCRM: it lists the organisations
 * you are a member of, and the move itself goes through set_active_org(),
 * which refuses anything you are not a member of. The app never writes the
 * tenant pointer directly — that column decides access.
 *
 * Renders nothing when there is nowhere to switch to, which is most staff.
 */
export function OrgSwitcher() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { isPlatformAdmin } = useUserRoles();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-tenant-memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user!.id);
      const ids = [...new Set((roles ?? []).map((r) => r.tenant_id).filter(Boolean))] as string[];
      if (ids.length < 2) return [];
      const { data } = await supabase.from("tenants").select("id, name").in("id", ids).order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (memberships.length < 2) return null;

  const pick = async (tenantId: string) => {
    setOpen(false);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_active_org", { p_org_id: tenantId });
      if (error) throw error;
      // Everything cached is scoped to the previous tenant.
      window.location.assign("/staff/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch organisation");
      setBusy(false);
    }
  };

  return (
    <div className="relative px-2 pb-2" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md border bg-background hover:bg-muted disabled:opacity-60"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 text-left">{tenant?.name ?? "Select organisation"}</span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4 opacity-50" />}
      </button>

      {open && (
        <div className="absolute left-2 right-2 z-50 mt-1 rounded-md border bg-background shadow-lg py-1">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Organisations
          </p>
          {memberships.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted"
            >
              <Check className={"h-4 w-4 shrink-0 " + (tenant?.id === m.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
          {isPlatformAdmin && (
            <>
              <div className="my-1 border-t" />
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/platform/dashboard"); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Platform console
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
