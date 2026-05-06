import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PLATFORM_DEFAULT_TENANT = "a0000000-0000-0000-0000-000000000001";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "expired";

export type OrgRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  is_active: boolean;
  created_at: string;
  plan: string | null;
  status: SubscriptionStatus | null;
  trial_end: string | null;
  staff_count: number;
  vendor_count: number;
  vendor_user_count: number;
};

export type DailyPoint = { date: string; orgs: number; vendors: number };

export type StatusBreakdown = { status: SubscriptionStatus | "no_subscription"; count: number };

export type PlatformDashboardData = {
  orgs: OrgRow[];
  totals: {
    orgs: number;
    trialOrgs: number;
    paidOrgs: number;
    inactiveOrgs: number;
    totalUsers: number;
    totalVendors: number;
    approvedVendors: number;
    approvalRate: number;
  };
  daily: DailyPoint[];
  statusBreakdown: StatusBreakdown[];
  recentOrgs: OrgRow[];
  failedWhatsapp24h: number;
};

const PAID_STATUSES: SubscriptionStatus[] = ["active", "past_due"];

export function usePlatformDashboard() {
  return useQuery({
    queryKey: ["platform-dashboard"],
    queryFn: async (): Promise<PlatformDashboardData> => {
      const since30 = new Date();
      since30.setDate(since30.getDate() - 29);
      const since30Iso = since30.toISOString().slice(0, 10);

      const since24h = new Date();
      since24h.setHours(since24h.getHours() - 24);

      const [
        tenantsRes,
        subsRes,
        profilesRes,
        vendorUsersRes,
        vendorsRes,
        vendorsRecentRes,
        whatsAppFailRes,
      ] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, slug, name, short_name, is_active, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("org_subscriptions")
          .select("tenant_id, plan, status, billing_cycle_end"),
        supabase.from("profiles").select("tenant_id"),
        supabase.from("vendor_users").select("tenant_id"),
        supabase.from("vendors").select("tenant_id, current_status, created_at"),
        supabase
          .from("vendors")
          .select("tenant_id, created_at")
          .gte("created_at", since30Iso),
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", since24h.toISOString()),
      ]);

      if (tenantsRes.error) throw tenantsRes.error;

      const tenants = tenantsRes.data ?? [];
      const subs = subsRes.data ?? [];
      const profiles = profilesRes.data ?? [];
      const vendorUsers = vendorUsersRes.data ?? [];
      const vendors = vendorsRes.data ?? [];

      const subByTenant: Record<string, { plan: string; status: SubscriptionStatus; billing_cycle_end: string | null }> = {};
      for (const s of subs as Array<{ tenant_id: string; plan: string; status: SubscriptionStatus; billing_cycle_end: string | null }>) {
        subByTenant[s.tenant_id] = { plan: s.plan, status: s.status, billing_cycle_end: s.billing_cycle_end };
      }

      const profileCount: Record<string, number> = {};
      for (const p of profiles) profileCount[p.tenant_id] = (profileCount[p.tenant_id] ?? 0) + 1;

      const vendorUserCount: Record<string, number> = {};
      for (const v of vendorUsers) vendorUserCount[v.tenant_id] = (vendorUserCount[v.tenant_id] ?? 0) + 1;

      const vendorCount: Record<string, number> = {};
      let approvedVendors = 0;
      for (const v of vendors as Array<{ tenant_id: string; current_status: string }>) {
        vendorCount[v.tenant_id] = (vendorCount[v.tenant_id] ?? 0) + 1;
        if (v.current_status === "approved") approvedVendors++;
      }

      const orgs: OrgRow[] = tenants.map((t) => {
        const sub = subByTenant[t.id];
        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          short_name: t.short_name,
          is_active: t.is_active,
          created_at: t.created_at,
          plan: sub?.plan ?? null,
          status: sub?.status ?? null,
          trial_end: sub?.billing_cycle_end ?? null,
          staff_count: profileCount[t.id] ?? 0,
          vendor_count: vendorCount[t.id] ?? 0,
          vendor_user_count: vendorUserCount[t.id] ?? 0,
        };
      });

      const customerOrgs = orgs.filter((o) => o.id !== PLATFORM_DEFAULT_TENANT);

      // Build last 30 days time series for orgs and vendors
      const dayKeys: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayKeys.push(d.toISOString().slice(0, 10));
      }

      const orgsByDay: Record<string, number> = Object.fromEntries(dayKeys.map((d) => [d, 0]));
      const vendorsByDay: Record<string, number> = Object.fromEntries(dayKeys.map((d) => [d, 0]));

      for (const t of tenants) {
        const d = (t.created_at ?? "").slice(0, 10);
        if (d in orgsByDay) orgsByDay[d]++;
      }
      for (const v of (vendorsRecentRes.data ?? []) as Array<{ created_at: string }>) {
        const d = (v.created_at ?? "").slice(0, 10);
        if (d in vendorsByDay) vendorsByDay[d]++;
      }

      const daily: DailyPoint[] = dayKeys.map((d) => ({
        date: d,
        orgs: orgsByDay[d],
        vendors: vendorsByDay[d],
      }));

      // Status breakdown across customer orgs only
      const statusCount: Record<string, number> = {};
      for (const o of customerOrgs) {
        const k = o.status ?? "no_subscription";
        statusCount[k] = (statusCount[k] ?? 0) + 1;
      }
      const statusBreakdown: StatusBreakdown[] = Object.entries(statusCount).map(([status, count]) => ({
        status: status as StatusBreakdown["status"],
        count,
      }));

      const trialOrgs = customerOrgs.filter((o) => o.status === "trial").length;
      const paidOrgs = customerOrgs.filter((o) => o.status && PAID_STATUSES.includes(o.status)).length;
      const inactiveOrgs = customerOrgs.filter((o) => !o.is_active).length;
      const totalUsers = customerOrgs.reduce((acc, o) => acc + o.staff_count + o.vendor_user_count, 0);
      const totalVendors = customerOrgs.reduce((acc, o) => acc + o.vendor_count, 0);
      const approvalRate = totalVendors === 0 ? 0 : Math.round((approvedVendors / totalVendors) * 100);

      const recentOrgs = customerOrgs.slice(0, 10);

      return {
        orgs: customerOrgs,
        totals: {
          orgs: customerOrgs.length,
          trialOrgs,
          paidOrgs,
          inactiveOrgs,
          totalUsers,
          totalVendors,
          approvedVendors,
          approvalRate,
        },
        daily,
        statusBreakdown,
        recentOrgs,
        failedWhatsapp24h: whatsAppFailRes.count ?? 0,
      };
    },
  });
}
