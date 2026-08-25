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
  agingHeatmapOption,
  dumbbellOption,
  rejectionOption,
  paymentFlowOption,
  submissionPendencyOption,
} from "@/components/analytics/invoiceChartOptions";
import { compactINR } from "@/lib/vizPalette";
import { formatINR } from "@/lib/invoices";
import { format } from "date-fns";
import {
  Loader2,
  Clock,
  FileCheck,
  Users,
  ArrowRight,
  AlertTriangle,
  Shield,
  Download,
  Sparkles,
  ClipboardCheck,
  HandCoins,
  ReceiptIndianRupee,
  TriangleAlert,
  FileBarChart2,
  Wallet,
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
  const rejectedVendors = vendors?.filter((v) => v.current_status === "rejected").length || 0;
  const pendingVendors = pendingReview + pendingApproval + returnedToMaker;
  const draftVendors = totalVendors - approvedVendors - pendingVendors - rejectedVendors;

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
              <div class="card-label">Approved Vendors</div>
              <div class="card-value" style="color: #22c55e">${approvedVendors}</div>
            </div>
            <div class="card">
              <div class="card-label">Pending Vendors</div>
              <div class="card-value" style="color: #eab308">${pendingVendors}</div>
            </div>
            <div class="card">
              <div class="card-label">Rejected Vendors</div>
              <div class="card-value" style="color: #ef4444">${rejectedVendors}</div>
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

          <div class="section-title">Cash Needed — Next 15 Days</div>
          <div class="metric-row">
            <span class="metric-label">Overdue Already</span>
            <span class="metric-value">${formatINR(a.cashNeeded15.overdueAmount)} (${a.cashNeeded15.overdueCount} invoice${a.cashNeeded15.overdueCount === 1 ? "" : "s"})</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Due Within 15 Days</span>
            <span class="metric-value">${formatINR(a.cashNeeded15.dueSoonAmount)} (${a.cashNeeded15.dueSoonCount} invoice${a.cashNeeded15.dueSoonCount === 1 ? "" : "s"})</span>
          </div>

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
  const hasAnyInvoiceData = a.totalInvoiceCount > 0 || a.overdueRows.length > 0;

  // Vendor status shape, for the proportion bar under the headline number.
  const vendorShare = (n: number) => (totalVendors > 0 ? Math.round((n / totalVendors) * 100) : 0);
  const approvedPct = vendorShare(approvedVendors);
  const pendingPct = vendorShare(pendingVendors);
  const rejectedPct = vendorShare(rejectedVendors);
  const draftPct = vendorShare(draftVendors);

  // Cash-needed shape, for the overdue vs due-soon split bar.
  const cashTotal = a.cashNeeded15.overdueAmount + a.cashNeeded15.dueSoonAmount;
  const overdueSharePct = cashTotal > 0 ? Math.round((a.cashNeeded15.overdueAmount / cashTotal) * 100) : 0;

  // Backlog direction, for the trend chart's headline callout.
  const backlogNow = a.pendencyTrend.pendency[a.pendencyTrend.pendency.length - 1] ?? 0;
  const backlogWasAt = a.pendencyTrend.pendency[0] ?? 0;
  const backlogDelta = backlogNow - backlogWasAt;
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
      <div ref={dashboardRef} className="p-4 md:p-6 space-y-4 w-full">
        {/* Compact header — one line, StaffLayout's top bar already carries the page title */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Welcome back, <span className="font-semibold text-foreground">{firstName}</span> · {format(new Date(), "EEE, dd MMM yyyy")}
          </p>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download Report
          </Button>
        </div>

        {/* Onboarding Checklist (first-run) */}
        <OnboardingChecklist
          vendorCount={totalVendors}
          hasInvitations={(invitationCount ?? 0) > 0}
        />

        {/* Main row: the trend graph leads, everything else condenses into the side column */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Trend — the operational pulse, gets the graph on screen one */}
          <Card className="lg:col-span-8">
            <CardHeader className="pb-1 flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-semibold">Invoice Submissions & Backlog — last 12 weeks</CardTitle>
                <p className="text-xs text-muted-foreground !mt-1">
                  New invoices submitted each week, against how many are still open awaiting a decision
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-extrabold text-foreground leading-none">{backlogNow}</p>
                <p className={`text-xs font-medium mt-1 ${backlogDelta > 0 ? "text-destructive" : backlogDelta < 0 ? "text-[hsl(var(--success))]" : "text-muted-foreground"}`}>
                  {backlogDelta > 0 ? `▲ up ${backlogDelta}` : backlogDelta < 0 ? `▼ down ${Math.abs(backlogDelta)}` : "unchanged"} vs 12 weeks ago
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <EChart
                option={submissionPendencyOption(a.pendencyTrend.labels, a.pendencyTrend.submitted, a.pendencyTrend.pendency)}
                height={420}
              />
            </CardContent>
          </Card>

          {/* Side column — the small numbers, condensed */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            {attentionItems.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                <h2 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-warning" />
                  Needs Your Attention
                </h2>
                <div className="space-y-1.5">
                  {attentionItems.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => navigate(item.action)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/80 border border-border/50 hover:shadow-sm transition-all text-left group"
                      >
                        <Icon className={`h-3.5 w-3.5 ${item.color} shrink-0`} />
                        <span className="text-xs font-medium text-foreground flex-1 leading-tight">{item.label}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => navigate("/staff/vendors")}
              className="text-left rounded-xl border border-border bg-card p-3 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor Status</span>
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
              <p className="text-2xl font-extrabold text-foreground leading-none mt-1">{totalVendors} <span className="text-xs font-normal text-muted-foreground">total</span></p>

              <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden bg-muted flex">
                <div className="h-full bg-[hsl(var(--success))]" style={{ width: `${approvedPct}%` }} />
                <div className="h-full bg-[hsl(var(--warning))]" style={{ width: `${pendingPct}%` }} />
                <div className="h-full bg-destructive" style={{ width: `${rejectedPct}%` }} />
                <div className="h-full bg-muted-foreground/30" style={{ width: `${draftPct}%` }} />
              </div>
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 text-xs flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
                  <b>{approvedVendors}</b> <span className="text-muted-foreground">approved</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))]" />
                  <b>{pendingVendors}</b> <span className="text-muted-foreground">pending</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  <b>{rejectedVendors}</b> <span className="text-muted-foreground">rejected</span>
                </span>
                {draftVendors > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    <b>{draftVendors}</b> <span className="text-muted-foreground">draft</span>
                  </span>
                )}
              </div>
            </button>

            <button
              onClick={() => navigate("/staff/invoices")}
              className="text-left rounded-xl border border-border bg-card p-3 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cash Needed — 15 Days</span>
                <Wallet className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              </div>
              <p className="text-2xl font-extrabold text-foreground leading-none mt-1">{compactINR(a.cashNeeded15.dueSoonAmount)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {a.cashNeeded15.dueSoonCount} invoice{a.cashNeeded15.dueSoonCount === 1 ? "" : "s"} due by {format(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), "dd MMM")}
              </p>

              {cashTotal > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden bg-muted flex">
                  <div className="h-full bg-destructive" style={{ width: `${overdueSharePct}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${100 - overdueSharePct}%` }} />
                </div>
              )}
              <div className="mt-2">
                {a.cashNeeded15.overdueAmount > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                    <TriangleAlert className="h-3 w-3 shrink-0" />
                    {compactINR(a.cashNeeded15.overdueAmount)} overdue ({a.cashNeeded15.overdueCount})
                  </div>
                ) : a.cashNeeded15.missingDueDateCount > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {a.cashNeeded15.missingDueDateCount} open invoice{a.cashNeeded15.missingDueDateCount === 1 ? "" : "s"} with no due date
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Nothing overdue right now</div>
                )}
              </div>
            </button>
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

            {/* rejection analysis */}
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
          </>
        )}
      </div>
    </StaffLayout>
  );
}
