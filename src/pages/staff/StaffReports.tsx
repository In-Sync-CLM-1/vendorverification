import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  Clock,
  AlertTriangle,
  Users,
  CheckCircle2,
  Hourglass,
  Timer,
  Loader2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const STATUS_CHART_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending_review: "#f59e0b",
  pending_approval: "#8b5cf6",
  returned_to_maker: "#f97316",
  approved: "#7AB648",
  rejected: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  pending_approval: "Pending Approval",
  returned_to_maker: "Returned by Approver",
  approved: "Approved",
  rejected: "Rejected",
};

interface VendorReportData {
  id: string;
  vendor_code: string;
  company_name: string;
  current_status: string;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  vendor_categories: { name: string };
}

interface WorkflowHistoryData {
  vendor_id: string;
  from_status: string;
  to_status: string;
  created_at: string;
  action_by: string;
}

export default function StaffReports() {
  const { isAdmin, isMaker } = useUserRoles();
  const [activeReport, setActiveReport] = useState("status");

  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ["staff-vendors-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select(`
          id,
          vendor_code,
          company_name,
          current_status,
          created_at,
          submitted_at,
          approved_at,
          vendor_categories (name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorReportData[];
    },
  });

  const { data: workflowHistory } = useQuery({
    queryKey: ["staff-workflow-history-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_history")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WorkflowHistoryData[];
    },
  });

  const calculateTAT = (vendor: VendorReportData) => {
    if (!vendor.submitted_at || !vendor.approved_at) return null;
    const submitted = new Date(vendor.submitted_at);
    const approved = new Date(vendor.approved_at);
    return Math.round(
      (approved.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
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
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isAdmin && !isMaker) {
    return (
      <StaffLayout title="Access Denied">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground">Access required</p>
        </div>
      </StaffLayout>
    );
  }

  // --- Computed data ---
  const statusCounts =
    vendors?.reduce((acc, v) => {
      acc[v.current_status] = (acc[v.current_status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

  const totalVendors = vendors?.length || 0;
  const approvedCount = statusCounts["approved"] || 0;
  const pendingCount =
    (statusCounts["pending_review"] || 0) +
    (statusCounts["pending_approval"] || 0) +
    (statusCounts["returned_to_maker"] || 0);

  const tatData = vendors
    ?.filter((v) => v.approved_at)
    .map((v) => ({
      "Vendor Code": v.vendor_code,
      "Company Name": v.company_name,
      Submitted: v.submitted_at
        ? format(new Date(v.submitted_at), "dd MMM yyyy")
        : "-",
      Approved: v.approved_at
        ? format(new Date(v.approved_at), "dd MMM yyyy")
        : "-",
      "TAT (Days)": calculateTAT(v) || 0,
    })) || [];

  const avgTAT =
    tatData.length > 0
      ? Math.round(
          tatData.reduce((sum, r) => sum + (r["TAT (Days)"] || 0), 0) /
            tatData.length
        )
      : 0;

  const statusData =
    vendors?.map((v) => ({
      "Vendor Code": v.vendor_code,
      "Company Name": v.company_name,
      Category: v.vendor_categories?.name,
      Status: v.current_status,
      Created: format(new Date(v.created_at), "dd MMM yyyy"),
      Submitted: v.submitted_at
        ? format(new Date(v.submitted_at), "dd MMM yyyy")
        : "-",
    })) || [];

  const pendingData =
    vendors
      ?.filter((v) =>
        ["pending_review", "pending_approval", "returned_to_maker"].includes(
          v.current_status
        )
      )
      .map((v) => ({
        "Vendor Code": v.vendor_code,
        "Company Name": v.company_name,
        Status: v.current_status,
        "Pending Since": v.submitted_at
          ? formatDistanceToNow(new Date(v.submitted_at), { addSuffix: true })
          : "-",
      })) || [];

  // Chart data
  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status,
    value: count,
    color: STATUS_CHART_COLORS[status] || "#94a3b8",
  }));

  const barData = tatData.slice(0, 12).map((r) => ({
    name: r["Vendor Code"] || r["Company Name"]?.slice(0, 10),
    days: r["TAT (Days)"],
  }));

  // --- Stat Cards ---
  const statCards = [
    {
      label: "Total Vendors",
      value: totalVendors,
      icon: Users,
      gradient: "from-[hsl(204,100%,35%)] to-[hsl(204,100%,50%)]",
    },
    {
      label: "Approved",
      value: approvedCount,
      icon: CheckCircle2,
      gradient: "from-[hsl(92,47%,45%)] to-[hsl(92,47%,60%)]",
    },
    {
      label: "Pending",
      value: pendingCount,
      icon: Hourglass,
      gradient: "from-[hsl(38,92%,50%)] to-[hsl(38,92%,62%)]",
    },
    {
      label: "Avg TAT",
      value: `${avgTAT}d`,
      icon: Timer,
      gradient: "from-[hsl(260,55%,50%)] to-[hsl(260,55%,65%)]",
    },
  ];

  const statusBadgeClasses: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    pending_approval: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    returned_to_maker: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <StaffLayout title="Reports & Analytics">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl">
        {/* ── Stat Cards ── */}
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

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Donut */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {vendorsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        boxShadow: "0 4px 20px rgba(0,0,0,.12)",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-12 text-sm">No data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Bar */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Approval TAT (days)</CardTitle>
            </CardHeader>
            <CardContent>
              {vendorsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} barSize={28}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        boxShadow: "0 4px 20px rgba(0,0,0,.12)",
                      }}
                    />
                    <Bar dataKey="days" fill="#0066B3" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-12 text-sm">
                  No approved vendors yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Tabbed Tables ── */}
        <Tabs value={activeReport} onValueChange={setActiveReport} className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-xl h-11">
            <TabsTrigger value="status" className="flex items-center gap-2 rounded-lg">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Status</span>
            </TabsTrigger>
            <TabsTrigger value="tat" className="flex items-center gap-2 rounded-lg">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">TAT</span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Pending</span>
            </TabsTrigger>
          </TabsList>

          {/* Status Report */}
          <TabsContent value="status" className="mt-4">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-muted/30">
                <CardTitle className="text-base">Vendor Status Report</CardTitle>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                  onClick={() => exportToCSV(statusData, "vendor-status-report.csv")}
                  disabled={vendorsLoading || !statusData.length}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {vendorsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">Code</th>
                          <th className="text-left py-3 px-4 font-medium">Company</th>
                          <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Category</th>
                          <th className="text-left py-3 px-4 font-medium">Status</th>
                          <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Created</th>
                          <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusData.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-border/50 hover:bg-muted/30 transition-colors even:bg-muted/10"
                          >
                            <td className="py-3 px-4 font-mono text-xs">{row["Vendor Code"]}</td>
                            <td className="py-3 px-4 font-medium">{row["Company Name"]}</td>
                            <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{row["Category"]}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  statusBadgeClasses[row["Status"]] || "bg-muted text-muted-foreground"
                                }`}
                              >
                                {STATUS_LABELS[row["Status"]] || row["Status"]}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground hidden sm:table-cell">
                              {row["Created"]}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground hidden lg:table-cell">
                              {row["Submitted"]}
                            </td>
                          </tr>
                        ))}
                        {statusData.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-muted-foreground">
                              No vendors found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAT Report */}
          <TabsContent value="tat" className="mt-4">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-muted/30">
                <CardTitle className="text-base">Approval Turnaround Time</CardTitle>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                  onClick={() => exportToCSV(tatData, "vendor-tat-report.csv")}
                  disabled={vendorsLoading || !tatData.length}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {vendorsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : tatData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">Code</th>
                          <th className="text-left py-3 px-4 font-medium">Company</th>
                          <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Submitted</th>
                          <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Approved</th>
                          <th className="text-left py-3 px-4 font-semibold">TAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tatData.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-border/50 hover:bg-muted/30 transition-colors even:bg-muted/10"
                          >
                            <td className="py-3 px-4 font-mono text-xs">{row["Vendor Code"]}</td>
                            <td className="py-3 px-4 font-medium">{row["Company Name"]}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground hidden sm:table-cell">
                              {row["Submitted"]}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground hidden sm:table-cell">
                              {row["Approved"]}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-bold text-primary">
                                {row["TAT (Days)"]}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-12 text-sm">
                    No approved vendors yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Cases */}
          <TabsContent value="pending" className="mt-4">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-muted/30">
                <CardTitle className="text-base">Pending Cases</CardTitle>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                  onClick={() => exportToCSV(pendingData, "pending-cases-report.csv")}
                  disabled={vendorsLoading || !pendingData.length}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {vendorsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : pendingData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">Code</th>
                          <th className="text-left py-3 px-4 font-medium">Company</th>
                          <th className="text-left py-3 px-4 font-medium">Status</th>
                          <th className="text-left py-3 px-4 font-medium">Pending Since</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingData.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-border/50 hover:bg-muted/30 transition-colors even:bg-muted/10"
                          >
                            <td className="py-3 px-4 font-mono text-xs">{row["Vendor Code"]}</td>
                            <td className="py-3 px-4 font-medium">{row["Company Name"]}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  statusBadgeClasses[row["Status"]] || "bg-muted text-muted-foreground"
                                }`}
                              >
                                {STATUS_LABELS[row["Status"]] || row["Status"]}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {row["Pending Since"]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-12 text-sm">
                    No pending cases
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </StaffLayout>
  );
}
