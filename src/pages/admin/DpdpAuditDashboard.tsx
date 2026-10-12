import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  ShieldCheck,
  Eye,
  Users,
  Building2,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { useUrlState } from "@/hooks/useUrlState";

interface AuditLog {
  id: string;
  user_id: string;
  vendor_id: string | null;
  accessed_at: string;
  table_name: string;
  column_name: string;
  purpose: string;
}

interface ProfileMap {
  [userId: string]: string;
}

export default function DpdpAuditDashboard() {
  const { isAdmin } = useUserRoles();

  const [dateFrom, setDateFrom] = useUrlState("from", "");
  const [dateTo, setDateTo] = useUrlState("to", "");
  const [filterUser, setFilterUser] = useUrlState("user", "all");
  const [filterTable, setFilterTable] = useUrlState("table", "all");
  const [filterPurpose, setFilterPurpose] = useUrlState("purpose", "all");

  // Fetch audit logs
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["dpdp-audit-logs", dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("pii_access_log")
        .select("*")
        .order("accessed_at", { ascending: false })
        .limit(500);

      if (dateFrom) query = query.gte("accessed_at", dateFrom);
      if (dateTo) query = query.lte("accessed_at", dateTo + "T23:59:59");

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: isAdmin,
  });

  // Batch-fetch profiles for user_ids in logs
  const userIds = useMemo(
    () => [...new Set(logs.map((l) => l.user_id))],
    [logs]
  );

  const { data: profileMap = {} } = useQuery({
    queryKey: ["audit-profiles", userIds],
    queryFn: async () => {
      if (!userIds.length) return {};
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (error) throw error;
      const map: ProfileMap = {};
      data.forEach((p) => {
        map[p.user_id] = p.full_name;
      });
      return map;
    },
    enabled: isAdmin && userIds.length > 0,
  });

  // Distinct filter options
  const distinctUsers = useMemo(() => {
    const entries = userIds.map((id) => ({
      id,
      name: profileMap[id] || id.slice(0, 8),
    }));
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [userIds, profileMap]);

  const distinctTables = useMemo(
    () => [...new Set(logs.map((l) => l.table_name))].sort(),
    [logs]
  );

  const distinctPurposes = useMemo(
    () => [...new Set(logs.map((l) => l.purpose))].sort(),
    [logs]
  );

  // Filtered logs
  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filterUser !== "all" && l.user_id !== filterUser) return false;
      if (filterTable !== "all" && l.table_name !== filterTable) return false;
      if (filterPurpose !== "all" && l.purpose !== filterPurpose) return false;
      return true;
    });
  }, [logs, filterUser, filterTable, filterPurpose]);

  // Stats
  const today = format(new Date(), "yyyy-MM-dd");
  const todayCount = logs.filter((l) => l.accessed_at.startsWith(today)).length;
  const uniqueUsers = new Set(logs.map((l) => l.user_id)).size;
  const uniqueVendors = new Set(logs.filter((l) => l.vendor_id).map((l) => l.vendor_id)).size;

  // CSV export
  const exportToCSV = () => {
    if (!filtered.length) return;
    const rows = filtered.map((l) => ({
      "Accessed At": format(new Date(l.accessed_at), "dd MMM yyyy HH:mm:ss"),
      User: profileMap[l.user_id] || l.user_id,
      Table: l.table_name,
      Column: l.column_name,
      "Vendor ID": l.vendor_id || "-",
      Purpose: l.purpose,
    }));
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = (row as any)[h];
            return typeof val === "string" && val.includes(",")
              ? `"${val}"`
              : val;
          })
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dpdp-audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <StaffLayout title="Access Denied">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </StaffLayout>
    );
  }

  const statCards = [
    {
      label: "Total Accesses",
      value: logs.length,
      icon: Eye,
      gradient: "from-[hsl(204,100%,35%)] to-[hsl(204,100%,50%)]",
    },
    {
      label: "Today",
      value: todayCount,
      icon: CalendarDays,
      gradient: "from-[hsl(92,47%,45%)] to-[hsl(92,47%,60%)]",
    },
    {
      label: "Unique Users",
      value: uniqueUsers,
      icon: Users,
      gradient: "from-[hsl(38,92%,50%)] to-[hsl(38,92%,62%)]",
    },
    {
      label: "Vendors Accessed",
      value: uniqueVendors,
      icon: Building2,
      gradient: "from-[hsl(260,55%,50%)] to-[hsl(260,55%,65%)]",
    },
  ];

  return (
    <StaffLayout title="DPDP Compliance Audit">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card, i) => (
            <div
              key={card.label}
              className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-shadow animate-fade-in`}
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-center justify-between mb-3">
                <card.icon className="h-6 w-6 opacity-80" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{card.value}</p>
              <p className="text-sm opacity-80 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">User</label>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {distinctUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Table</label>
                <Select value={filterTable} onValueChange={setFilterTable}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tables</SelectItem>
                    {distinctTables.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Purpose</label>
                <Select value={filterPurpose} onValueChange={setFilterPurpose}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Purposes</SelectItem>
                    {distinctPurposes.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Log Table */}
        <Card className="border-0 shadow-md overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between bg-muted/30">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              PII Access Logs ({filtered.length})
            </CardTitle>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={exportToCSV}
              disabled={isLoading || !filtered.length}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left py-3 px-4 font-medium">Accessed At</th>
                      <th className="text-left py-3 px-4 font-medium">User</th>
                      <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Table</th>
                      <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Column</th>
                      <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Vendor ID</th>
                      <th className="text-left py-3 px-4 font-medium">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log, idx) => (
                      <tr
                        key={log.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors even:bg-muted/10"
                      >
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          {format(new Date(log.accessed_at), "dd MMM yyyy HH:mm")}
                        </td>
                        <td className="py-3 px-4 font-medium text-sm">
                          {profileMap[log.user_id] || log.user_id.slice(0, 8) + "…"}
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell font-mono text-xs">
                          {log.table_name}
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell font-mono text-xs">
                          {log.column_name}
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell font-mono text-xs text-muted-foreground">
                          {log.vendor_id ? log.vendor_id.slice(0, 8) + "…" : "-"}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {log.purpose}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          No PII access logs found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffLayout>
  );
}
