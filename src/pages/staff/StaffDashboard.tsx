import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useStaffVendorQueue } from "@/hooks/useStaffWorkflow";
import { useDataRequests } from "@/hooks/useDataRequests";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { useVendorPaymentFlow } from "@/hooks/useVendorPaymentFlow";
import { OnboardingChecklist } from "@/components/staff/OnboardingChecklist";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EChart } from "@/components/analytics/EChart";
import { StatTile } from "@/components/analytics/StatTile";
import {
  AnalyticsDateFilter,
  AnalyticsRange,
  defaultAnalyticsRange,
} from "@/components/analytics/AnalyticsDateFilter";
import {
  cashMotionOption,
  pipelineOption,
  compositionOption,
  agingHeatmapOption,
  dumbbellOption,
  lifecycleFunnelOption,
  vendorDensityOption,
  quadrantOption,
  delayHistogramOption,
  flowTrendOption,
  rejectionOption,
  paidRankingOption,
  approveTrendOption,
  paymentFlowOption,
} from "@/components/analytics/invoiceChartOptions";
import { compactINR, fullINR } from "@/lib/vizPalette";
import { formatINR } from "@/lib/invoices";
import { formatDistanceToNow, format } from "date-fns";
import {
  Loader2,
  Clock,
  FileCheck,
  Users,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  AlertTriangle,
  Zap,
  Target,
  Shield,
  ChevronRight,
  Download,
  Sparkles,
  ClipboardCheck,
  HandCoins,
  ReceiptIndianRupee,
  TriangleAlert,
  FileBarChart2,
} from "lucide-react";

const pctDelta = (cur: number, prev: number | null): number | null =>
  prev === null || prev <= 0 ? null : ((cur - prev) / prev) * 100;

function MiniKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-lg font-semibold leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const { isAdmin, isLoading: rolesLoading } = useUserRoles();
  const { data: vendors, isLoading: vendorsLoading } = useStaffVendorQueue();
  const { data: dataRequestStats } = useDataRequests();
  const navigate = useNavigate();
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Shared filter for the whole Vendor Finance section below (combined
  // payment-flow graphic + the invoice analytics that used to live on their
  // own page) — one filter row, one dashboard.
  const [range, setRange] = useState<AnalyticsRange>(defaultAnalyticsRange);
  const [vendorFilter, setVendorFilter] = useState("all");
  const flow = useVendorPaymentFlow(range, vendorFilter);
  const a = useInvoiceAnalytics(range, vendorFilter);

  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, department")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: docStats } = useQuery({
    queryKey: ["dashboard-doc-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_documents")
        .select("status, expiry_date");
      if (error) throw error;
      const total = data?.length || 0;
      const approved = data?.filter((d) => d.status === "approved").length || 0;
      const now = new Date();
      const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiring = data?.filter(
        (d) => d.expiry_date && new Date(d.expiry_date) > now && new Date(d.expiry_date) <= thirtyDays
      ).length || 0;
      return {
        total,
        approved,
        complianceRate: total > 0 ? Math.round((approved / total) * 100) : 0,
        expiring,
      };
    },
    enabled: !!user,
  });

  // Vendor payment pipeline: PI/Quotation -> Advance Request -> Invoice, so
  // Needs Your Attention can flag what's outstanding right now (unfiltered,
  // separate from the filtered analytics further down the page).
  const { data: financeStats } = useQuery({
    queryKey: ["dashboard-finance-stats"],
    queryFn: async () => {
      const [piRes, advanceRes, invoiceRes, paymentsRes] = await Promise.all([
        supabase.from("vendor_pi_quotations").select("status"),
        supabase.from("vendor_advance_requests").select("status, amount"),
        supabase.from("vendor_invoices").select("id, status, invoice_amount"),
        supabase.from("vendor_invoice_payments").select("invoice_id, total_settled"),
      ]);
      if (piRes.error) throw piRes.error;
      if (advanceRes.error) throw advanceRes.error;
      if (invoiceRes.error) throw invoiceRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const settledByInvoice = new Map<string, number>();
      for (const p of paymentsRes.data || []) {
        settledByInvoice.set(
          p.invoice_id,
          (settledByInvoice.get(p.invoice_id) || 0) + Number(p.total_settled || 0)
        );
      }

      const pendingPi = (piRes.data || []).filter((r) => r.status === "submitted").length;
      const pendingAdvance = (advanceRes.data || []).filter((r) => r.status === "pending");
      const pendingAdvanceValue = pendingAdvance.reduce((s, r) => s + Number(r.amount || 0), 0);
      const invoicesToReview = (invoiceRes.data || []).filter((r) =>
        ["submitted", "under_review"].includes(r.status)
      ).length;
      const invoicesToPay = (invoiceRes.data || []).filter((r) =>
        ["approved", "partially_paid"].includes(r.status)
      );
      const invoicesToPayValue = invoicesToPay.reduce(
        (s, r) => s + Number(r.invoice_amount) - (settledByInvoice.get(r.id) || 0),
        0
      );

      return {
        pendingPi,
        pendingAdvanceCount: pendingAdvance.length,
        pendingAdvanceValue,
        invoicesToReview,
        invoicesToPay: invoicesToPay.length,
        invoicesToPayValue,
      };
    },
    enabled: !!user,
  });

  // Check if invitations exist (for onboarding checklist)
  const { data: invitationCount } = useQuery({
    queryKey: ["invitation-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("vendor_invitations")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user!.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  if (rolesLoading || vendorsLoading) {
    return (
      <StaffLayout title="Dashboard">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StaffLayout>
    );
  }

  const pendingReview = vendors?.filter((v) => v.current_status === "pending_review").length || 0;
  const pendingApproval = vendors?.filter((v) => v.current_status === "pending_approval").length || 0;
  const approvedVendors = vendors?.filter((v) => v.current_status === "approved").length || 0;
  const totalVendors = vendors?.length || 0;
  const returnedToMaker = vendors?.filter((v) => (v.current_status as string) === "returned_to_maker").length || 0;

  const recentActivity = vendors?.slice(0, 6) || [];

  const attentionItems = [
    pendingReview > 0 && { label: `${pendingReview} vendor${pendingReview > 1 ? "s" : ""} pending review`, action: "/staff/queue", color: "text-warning", icon: Clock },
    pendingApproval > 0 && { label: `${pendingApproval} vendor${pendingApproval > 1 ? "s" : ""} awaiting approval`, action: "/staff/queue", color: "text-accent", icon: FileCheck },
    returnedToMaker > 0 && { label: `${returnedToMaker} vendor${returnedToMaker > 1 ? "s" : ""} returned by approver for re-review`, action: "/staff/queue", color: "text-orange-600", icon: AlertTriangle },
    (docStats?.expiring ?? 0) > 0 && { label: `${docStats?.expiring} document${(docStats?.expiring ?? 0) > 1 ? "s" : ""} expiring in 30 days`, action: "/staff/vendors", color: "text-destructive", icon: AlertTriangle },
    (dataRequestStats?.overdue ?? 0) > 0 && isAdmin && { label: `${dataRequestStats?.overdue} overdue data request${(dataRequestStats?.overdue ?? 0) > 1 ? "s" : ""}`, action: "/admin/dpdp-audit", color: "text-destructive", icon: Shield },
    (financeStats?.pendingPi ?? 0) > 0 && { label: `${financeStats?.pendingPi} PI/Quotation${(financeStats?.pendingPi ?? 0) > 1 ? "s" : ""} awaiting approval`, action: "/staff/pi-approvals", color: "text-accent", icon: ClipboardCheck },
    (financeStats?.pendingAdvanceCount ?? 0) > 0 && { label: `${financeStats?.pendingAdvanceCount} advance request${(financeStats?.pendingAdvanceCount ?? 0) > 1 ? "s" : ""} awaiting a decision`, action: "/staff/advance-requests", color: "text-amber-600", icon: HandCoins },
    (financeStats?.invoicesToReview ?? 0) > 0 && { label: `${financeStats?.invoicesToReview} invoice${(financeStats?.invoicesToReview ?? 0) > 1 ? "s" : ""} awaiting review`, action: "/staff/invoices", color: "text-primary", icon: ReceiptIndianRupee },
  ].filter(Boolean) as { label: string; action: string; color: string; icon: typeof Clock }[];

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: "Draft",
      pending_review: "Submitted for Review",
      pending_approval: "Pending Approval",
      approved: "Approved",
      rejected: "Rejected",
      returned_to_maker: "Returned by Approver",
    };
    return map[status] || status;
  };

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="h-4 w-4" />;
    if (status === "rejected" || status === "returned_to_maker") return <AlertTriangle className="h-4 w-4" />;
    return <FileSearch className="h-4 w-4" />;
  };

  const statusColor = (status: string) => {
    if (status === "approved") return "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]";
    if (status === "rejected") return "bg-destructive/10 text-destructive";
    if (status === "returned_to_maker") return "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]";
    return "bg-primary/10 text-primary";
  };

  const firstName = profile?.full_name?.split(" ")[0] || "there";

  const handleDownloadPDF = () => {
    const printContent = dashboardRef.current;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Dashboard Report - ${format(new Date(), "dd MMM yyyy")}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #1a1a1a; }
            h1 { font-size: 24px; margin-bottom: 4px; }
            .subtitle { color: #666; font-size: 14px; margin-bottom: 32px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
            .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
            .card-label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
            .card-value { font-size: 32px; font-weight: 800; margin-top: 8px; }
            .section-title { font-size: 16px; font-weight: 700; margin: 24px 0 12px; }
            .metric-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
            .metric-label { color: #666; font-size: 13px; }
            .metric-value { font-weight: 700; font-size: 18px; }
            .attention { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 14px; margin-bottom: 8px; border-radius: 6px; font-size: 13px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>Vendor-Sync Dashboard Report</h1>
          <p class="subtitle">Generated on ${format(new Date(), "dd MMMM yyyy, hh:mm a")} by ${profile?.full_name || "Staff"}</p>

          <div class="grid">
            <div class="card">
              <div class="card-label">Pending Review</div>
              <div class="card-value" style="color: #eab308">${pendingReview}</div>
            </div>
            <div class="card">
              <div class="card-label">Pending Approval</div>
              <div class="card-value" style="color: #6366f1">${pendingApproval}</div>
            </div>
            <div class="card">
              <div class="card-label">Approved</div>
              <div class="card-value" style="color: #22c55e">${approvedVendors}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Vendors</div>
              <div class="card-value" style="color: #3b82f6">${totalVendors}</div>
            </div>
          </div>

          ${attentionItems.length > 0 ? `
            <div class="section-title">Needs Attention</div>
            ${attentionItems.map(item => `<div class="attention">${item.label}</div>`).join("")}
          ` : ""}

          <div class="section-title">Vendor Payment Pipeline</div>
          <div class="metric-row">
            <span class="metric-label">PI / Quotation Awaiting Approval</span>
            <span class="metric-value">${financeStats?.pendingPi ?? 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Advance Requests Pending</span>
            <span class="metric-value">${financeStats?.pendingAdvanceCount ?? 0} (${formatINR(financeStats?.pendingAdvanceValue ?? 0)})</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Invoices Awaiting Review</span>
            <span class="metric-value">${financeStats?.invoicesToReview ?? 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Invoices Awaiting Payment</span>
            <span class="metric-value">${financeStats?.invoicesToPay ?? 0} (${formatINR(financeStats?.invoicesToPayValue ?? 0)})</span>
          </div>

          <div class="section-title">Key Metrics</div>
          <div class="metric-row">
            <span class="metric-label">Compliance Rate</span>
            <span class="metric-value">${docStats?.complianceRate ?? 0}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Documents Expiring (30 days)</span>
            <span class="metric-value">${docStats?.expiring ?? 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Total Documents</span>
            <span class="metric-value">${docStats?.total ?? 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Approved Documents</span>
            <span class="metric-value">${docStats?.approved ?? 0}</span>
          </div>
          ${isAdmin ? `
          <div class="metric-row">
            <span class="metric-label">Pending Data Requests (DPDP)</span>
            <span class="metric-value">${dataRequestStats?.pending ?? 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Overdue Data Requests</span>
            <span class="metric-value">${dataRequestStats?.overdue ?? 0}</span>
          </div>
          ` : ""}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // ── merged in from the old standalone Invoice Analytics page ──
  const pipelineTotal = a.pipeline.reduce((s, p) => s + p.amount, 0);
  const hasAnyInvoiceData = a.totalInvoiceCount > 0 || a.overdueRows.length > 0;
  const heatmapHeight = Math.max(160, a.agingRows.length * 38 + 80);
  const dumbbellHeight = Math.max(180, a.dumbbell.length * 42 + 70);

  const exportSummaryCsv = () => {
    const esc = (v: string | number) => {
      const str = String(v ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines: string[] = [];
    lines.push(`Invoice Analytics export`);
    lines.push(`Period,${range.label},${range.from ? format(range.from, "yyyy-MM-dd") : "all"} to ${range.to ? format(range.to, "yyyy-MM-dd") : "all"}`);
    lines.push(`Vendor filter,${vendorFilter === "all" ? "All vendors" : flow.vendorOptions.find((v) => v.id === vendorFilter)?.name || vendorFilter}`);
    lines.push("");
    lines.push("PROCESS HEALTH");
    lines.push(`Approval rate %,${a.processKpis.approvalRatePct ?? ""}`);
    lines.push(`Rejection rate %,${a.processKpis.rejectionRatePct ?? ""}`);
    lines.push(`Avg days to approve,${a.processKpis.avgApproveDays ?? ""}`);
    lines.push(`Median days to pay,${a.processKpis.medianPayDays ?? ""}`);
    lines.push(`PO coverage %,${a.processKpis.poCoveragePct ?? ""}`);
    lines.push(`GST in period (₹),${Math.round(a.processKpis.gstInRange)}`);
    lines.push(`TDS in period (₹),${Math.round(a.processKpis.tdsInRange)}`);
    lines.push("");
    lines.push("BY VENDOR");
    lines.push("Vendor,Code,Invoices,Invoiced (₹),Avg size (₹),Approval %,Rejection %,Avg days to approve,Avg days to pay,PO %,Settled (₹),Outstanding (₹),TDS (₹)");
    for (const v of a.deepVendorRows) {
      const money = a.vendorRows.find((m) => m.vendorId === v.vendorId);
      lines.push([
        esc(v.name), v.code, v.invoices, v.invoiced, v.avgSize,
        v.approvalPct ?? "", v.rejectionPct ?? "", v.avgApproveDays ?? "", v.avgPayDays ?? "",
        v.poPct, Math.round(money?.settled ?? 0), v.outstanding, v.tds,
      ].join(","));
    }
    lines.push("");
    lines.push("BY MONTH");
    lines.push("Month,Invoiced (₹),Settled (₹),Outstanding at month end (₹),Paid out (₹),Advance adjusted (₹),TDS (₹)");
    for (const m of a.byMonthCsv) {
      lines.push([esc(m.month), m.invoiced, m.settled, m.outstandingEnd, m.payout, m.advance, m.tds].join(","));
    }
    lines.push("");
    lines.push("OVERDUE INVOICES (as of today)");
    lines.push("Invoice,Vendor,Invoice date,Age (days),Amount (₹),Settled (₹),Outstanding (₹)");
    for (const r of a.overdueRows) {
      lines.push([esc(r.invoiceNumber), esc(r.vendorName), r.invoiceDate, r.age, r.amount, Math.round(r.settled), Math.round(r.outstanding)].join(","));
    }
    lines.push("");
    lines.push("REJECTION REASONS");
    lines.push("Reason,Invoices,Amount (₹)");
    for (const r of a.rejectionRows) lines.push([esc(r.reason), r.count, Math.round(r.amount)].join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = "invoice-analytics-summary.csv";
    el.click();
    URL.revokeObjectURL(url);
  };

  return (
    <StaffLayout title="Dashboard">
      <div ref={dashboardRef} className="p-4 md:p-6 space-y-5 w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(), "EEEE, dd MMMM yyyy")}
            </p>
          </div>
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        </div>

        {/* Onboarding Checklist (first-run) */}
        <OnboardingChecklist
          vendorCount={totalVendors}
          hasInvitations={(invitationCount ?? 0) > 0}
        />

        {/* Needs Your Attention */}
        {attentionItems.length > 0 && (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-warning" />
              Needs Your Attention
            </h2>
            <div className="space-y-2">
              {attentionItems.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={i}
                    onClick={() => navigate(item.action)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-border/50 hover:shadow-sm transition-all text-left group"
                  >
                    <Icon className={`h-5 w-5 ${item.color} shrink-0`} />
                    <span className="text-sm font-medium text-foreground flex-1">{item.label}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => navigate("/staff/queue")}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--warning))]/10 to-[hsl(var(--warning))]/5 border border-[hsl(var(--warning))]/20 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-1"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Review</span>
            <p className="text-4xl font-extrabold text-[hsl(var(--warning))] mt-2">{pendingReview}</p>
            <div className="absolute bottom-0 right-0 opacity-[0.07]"><Clock className="h-20 w-20 -mb-3 -mr-3" /></div>
          </button>

          <button
            onClick={() => navigate("/staff/queue")}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-1"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Approval</span>
            <p className="text-4xl font-extrabold text-accent mt-2">{pendingApproval}</p>
            <div className="absolute bottom-0 right-0 opacity-[0.07]"><FileCheck className="h-20 w-20 -mb-3 -mr-3" /></div>
          </button>

          <button
            onClick={() => navigate("/staff/vendors")}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--success))]/10 to-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-1"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approved</span>
            <p className="text-4xl font-extrabold text-[hsl(var(--success))] mt-2">{approvedVendors}</p>
            <div className="absolute bottom-0 right-0 opacity-[0.07]"><CheckCircle2 className="h-20 w-20 -mb-3 -mr-3" /></div>
          </button>

          <button
            onClick={() => navigate("/staff/vendors")}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-1"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Vendors</span>
            <p className="text-4xl font-extrabold text-primary mt-2">{totalVendors}</p>
            <div className="absolute bottom-0 right-0 opacity-[0.07]"><Users className="h-20 w-20 -mb-3 -mr-3" /></div>
          </button>
        </div>

        {/* Activity + Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Recent Activity */}
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground">Recent Activity</h2>
              <button
                onClick={() => navigate("/staff/queue")}
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
              >
                View Queue <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-0 max-h-[280px] overflow-y-auto">
              {recentActivity.map((vendor) => (
                <button
                  key={vendor.id}
                  onClick={() => navigate(`/staff/vendor/${vendor.id}`)}
                  className="flex items-start gap-3 w-full p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${statusColor(vendor.current_status)}`}>
                    {statusIcon(vendor.current_status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{vendor.company_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{statusLabel(vendor.current_status)}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 shrink-0">
                    {formatDistanceToNow(new Date(vendor.updated_at), { addSuffix: true })}
                  </span>
                </button>
              ))}
              {recentActivity.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
              )}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-bold text-foreground mb-4">Key Metrics</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">Compliance Rate</p>
                  <p className="text-2xl font-bold text-foreground">{docStats?.complianceRate ?? 0}%</p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-[hsl(var(--success))]/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-[hsl(var(--success))]" />
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">Expiring Documents</p>
                  <p className="text-2xl font-bold text-foreground">{docStats?.expiring ?? 0}</p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-[hsl(var(--warning))]/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-[hsl(var(--warning))]" />
                </div>
              </div>
              {isAdmin && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground">DPDP Data Requests</p>
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold text-foreground">{dataRequestStats?.pending ?? 0}</p>
                        {(dataRequestStats?.overdue ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            {dataRequestStats?.overdue} overdue
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════ Vendor Finance (merged Invoice Analytics) ══════════════ */}
        <div className="pt-4">
          <h2 className="text-xl font-bold text-foreground">Vendor Finance</h2>
          <p className="text-sm text-muted-foreground">
            PI/Quotation, Advance Requests and Invoices — billing flow, payment pipeline and vendor exposure, all following the filters below
          </p>
        </div>

        {/* Filter row (scopes everything in this section) */}
        <div className="flex flex-wrap items-center gap-2">
          <AnalyticsDateFilter value={range} onChange={setRange} />
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="h-9 w-[230px]">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {flow.vendorOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 ml-auto" onClick={exportSummaryCsv} disabled={!hasAnyInvoiceData}>
            <Download className="h-4 w-4 mr-2" /> Export Invoice CSV
          </Button>
        </div>

        {/* Combined payment-flow graphic: PI/Advance/Invoices x Submitted/Approved/Settled */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payment flow — PI/Quotation, Advance Requests and Invoices by status
            </CardTitle>
            <p className="text-xs text-muted-foreground !mt-1">
              Submitted, Approved and Settled ₹ for each document type, scoped to the filters above
            </p>
          </CardHeader>
          <CardContent>
            {flow.isLoading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : (
              <>
                <EChart option={paymentFlowOption(flow.stages)} height={320} />
                <p className="text-xs text-muted-foreground mt-2">
                  Advance Requests' Settled figure is the total advance money adjusted against invoice payments for this vendor/period —
                  the system links a payment to a vendor and amount, not to one specific advance request.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {a.isLoading ? (
          <div className="py-24 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : !hasAnyInvoiceData ? (
          <Card>
            <CardContent className="py-16 text-center space-y-2">
              <FileBarChart2 className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="font-medium">No invoice activity in this period</p>
              <p className="text-sm text-muted-foreground">
                Widen the date range, or wait for vendors to submit invoices.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <StatTile
                label={`Invoiced · ${range.label.toLowerCase()}`}
                value={compactINR(a.kpis.invoicedInRange)}
                deltaPct={pctDelta(a.kpis.invoicedInRange, a.kpis.invoicedPrev)}
                spark={a.sparkInvoiced}
              />
              <StatTile
                label={`Settled · ${range.label.toLowerCase()}`}
                value={compactINR(a.kpis.settledInRange)}
                deltaPct={pctDelta(a.kpis.settledInRange, a.kpis.settledPrev)}
                spark={a.sparkSettled}
              />
              <StatTile
                label="Outstanding today"
                value={compactINR(a.kpis.outstandingNow)}
                deltaPct={pctDelta(a.kpis.outstandingNow, a.kpis.outstandingPrevMonth)}
                deltaLabel="vs a month ago"
                upIsGood={false}
                spark={a.sparkOutstanding}
              />
              <StatTile
                label="Avg days to pay"
                value={a.kpis.avgDaysToPay === null ? "—" : `${a.kpis.avgDaysToPay}d`}
                deltaPct={null}
                sub={
                  a.kpis.paidCount > 0
                    ? `across ${a.kpis.paidCount} invoice${a.kpis.paidCount === 1 ? "" : "s"} fully paid`
                    : "no invoices fully paid in this period"
                }
              />
            </div>

            {/* ── Cash motion ── */}
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cash motion — billed vs settled, with the running balance owed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EChart
                  option={cashMotionOption(a.months, a.invoicedByMonth, a.settledByMonth, a.runningOutstanding)}
                  height={280}
                />
              </CardContent>
            </Card>

            {/* ── Pipeline ── */}
            <Card>
              <CardHeader className="pb-1 flex-row items-baseline justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Payment pipeline — how far along the period's {fullINR(pipelineTotal)} is
                </CardTitle>
                {a.rejectedCount > 0 && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <TriangleAlert className="h-3 w-3 text-[#d03b3b]" />
                    {a.rejectedCount} rejected · {compactINR(a.rejectedAmount)} (not shown)
                  </span>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {pipelineTotal > 0 ? (
                  <EChart option={pipelineOption(a.pipeline, pipelineTotal)} height={96} />
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">No invoices in this period</p>
                )}
              </CardContent>
            </Card>

            {/* ── Aging + exposure ── */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Unpaid money by age — as of today
                  </CardTitle>
                  {a.agingTotals[3] > 0 && (
                    <p className="text-xs !mt-1 inline-flex items-center gap-1 text-[#b02a2a]">
                      <TriangleAlert className="h-3 w-3" />
                      {compactINR(a.agingTotals[3])} is over 90 days old
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {a.agingRows.length > 0 ? (
                    <EChart option={agingHeatmapOption(a.agingRows)} height={heatmapHeight} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-10 text-center">
                      Nothing outstanding — all invoices settled 🎉
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Biggest vendors this period — billed ↔ settled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {a.dumbbell.length > 0 ? (
                    <EChart option={dumbbellOption(a.dumbbell)} height={dumbbellHeight} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-10 text-center">No invoices in this period</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Settlement mix + who got paid the most ── */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    What settlements were made of — payout, advance and TDS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EChart
                    option={compositionOption(a.months, a.compPayout, a.compAdvance, a.compTds)}
                    height={Math.max(240, Math.min(12, a.paidRanking.length) * 30 + 60)}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Highest to lowest paid — ₹ settled per vendor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {a.paidRanking.length > 0 ? (
                    <EChart
                      option={paidRankingOption(a.paidRanking)}
                      height={Math.max(240, Math.min(12, a.paidRanking.length) * 30 + 60)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground py-10 text-center">No payments in this period</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ══════════════ Process intelligence (deep analysis) ══════════════ */}
            <div className="pt-2">
              <h2 className="text-base font-semibold">Process intelligence</h2>
              <p className="text-sm text-muted-foreground">
                How well the invoice-to-payment process itself is running — same filters apply
              </p>
            </div>

            {/* process health strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              <MiniKpi
                label="Approval rate"
                value={a.processKpis.approvalRatePct === null ? "—" : `${a.processKpis.approvalRatePct}%`}
                sub="of decided invoices"
              />
              <MiniKpi
                label="Rejection rate"
                value={a.processKpis.rejectionRatePct === null ? "—" : `${a.processKpis.rejectionRatePct}%`}
                sub={`${a.rejectedCount} rejected · ${compactINR(a.rejectedAmount)}`}
              />
              <MiniKpi
                label="Avg days to approve"
                value={a.processKpis.avgApproveDays === null ? "—" : `${a.processKpis.avgApproveDays}d`}
                sub="invoice date → review"
              />
              <MiniKpi
                label="Median days to pay"
                value={a.processKpis.medianPayDays === null ? "—" : `${a.processKpis.medianPayDays}d`}
                sub="invoice date → fully paid"
              />
              <MiniKpi
                label="PO coverage"
                value={a.processKpis.poCoveragePct === null ? "—" : `${a.processKpis.poCoveragePct}%`}
                sub="invoices backed by a PO"
              />
              <MiniKpi
                label="GST / TDS in period"
                value={compactINR(a.processKpis.gstInRange)}
                sub={`TDS deducted ${compactINR(a.processKpis.tdsInRange)}`}
              />
            </div>

            {/* funnel + flow trend */}
            <div className="grid lg:grid-cols-5 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Invoice lifecycle — where value drops off
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EChart option={lifecycleFunnelOption(a.funnel)} height={230} />
                  <p className="text-xs text-muted-foreground text-center">
                    {a.funnel.inReview > 0 && `${a.funnel.inReview} invoice${a.funnel.inReview === 1 ? "" : "s"} still in review · `}
                    approval and payment rates in the tooltip
                  </p>
                </CardContent>
              </Card>
              <Card className="lg:col-span-3">
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Flow by {a.flowGranularity} — submissions and approvals above, money out below
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EChart
                    option={flowTrendOption(a.flowLabels, a.flowSubmitted, a.flowApproved, a.flowSettled)}
                    height={290}
                  />
                </CardContent>
              </Card>
            </div>

            {/* vendor density map */}
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Vendor performance map — every column shaded against its own best
                </CardTitle>
              </CardHeader>
              <CardContent>
                {a.deepVendorRows.length > 0 ? (
                  <EChart
                    option={vendorDensityOption(a.deepVendorRows.slice(0, 12))}
                    height={Math.max(220, Math.min(12, a.deepVendorRows.length) * 36 + 70)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-10 text-center">No invoices in this period</p>
                )}
              </CardContent>
            </Card>

            {/* quadrant + delay histogram */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Exposure vs pay speed — top-right is "big and slow"
                  </CardTitle>
                  <p className="text-xs text-muted-foreground !mt-1">
                    Dot size = money outstanding now · lines mark the medians
                  </p>
                </CardHeader>
                <CardContent>
                  {a.quadrant.length >= 3 ? (
                    <EChart option={quadrantOption(a.quadrant)} height={300} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-10 text-center">
                      Not enough fully paid invoices yet to compare vendors
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    How long payment takes — distribution of fully paid invoices
                  </CardTitle>
                  <p className="text-xs text-muted-foreground !mt-1">
                    {a.processKpis.medianPayDays !== null && `Median ${a.processKpis.medianPayDays} days · `}
                    hover a bar for the ₹ value in that band
                  </p>
                </CardHeader>
                <CardContent>
                  <EChart option={delayHistogramOption(a.delayHistogram)} height={300} />
                </CardContent>
              </Card>
            </div>

            {/* rejection analysis + approval-speed trend */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground inline-flex items-center gap-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 text-[#d03b3b]" />
                    Why invoices get rejected — {compactINR(a.rejectedAmount)} blocked
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {a.rejectionRows.length > 0 ? (
                    <EChart option={rejectionOption(a.rejectionRows)} height={220} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-10 text-center">
                      No rejections in this period 🎉
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Is approval getting faster? — avg days to approve, by {a.flowGranularity}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EChart option={approveTrendOption(a.flowLabels, a.approveTrend)} height={220} />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </StaffLayout>
  );
}
