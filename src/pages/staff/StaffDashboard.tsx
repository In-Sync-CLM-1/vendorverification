import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useStaffVendorQueue } from "@/hooks/useStaffWorkflow";
import { useDataRequests } from "@/hooks/useDataRequests";
import { OnboardingChecklist } from "@/components/staff/OnboardingChecklist";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

export default function StaffDashboard() {
  const { user } = useAuth();
  const { isAdmin, isLoading: rolesLoading } = useUserRoles();
  const { data: vendors, isLoading: vendorsLoading } = useStaffVendorQueue();
  const { data: dataRequestStats } = useDataRequests();
  const navigate = useNavigate();
  const dashboardRef = useRef<HTMLDivElement>(null);

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
  const sentBack = vendors?.filter((v) => v.current_status === "sent_back").length || 0;

  const recentActivity = vendors?.slice(0, 6) || [];

  const attentionItems = [
    pendingReview > 0 && { label: `${pendingReview} vendor${pendingReview > 1 ? "s" : ""} pending review`, action: "/staff/queue", color: "text-warning", icon: Clock },
    pendingApproval > 0 && { label: `${pendingApproval} vendor${pendingApproval > 1 ? "s" : ""} awaiting approval`, action: "/staff/queue", color: "text-accent", icon: FileCheck },
    sentBack > 0 && { label: `${sentBack} vendor${sentBack > 1 ? "s" : ""} sent back for corrections`, action: "/staff/queue", color: "text-orange-600", icon: AlertTriangle },
    (docStats?.expiring ?? 0) > 0 && { label: `${docStats?.expiring} document${(docStats?.expiring ?? 0) > 1 ? "s" : ""} expiring in 30 days`, action: "/staff/vendors", color: "text-destructive", icon: AlertTriangle },
    (dataRequestStats?.overdue ?? 0) > 0 && isAdmin && { label: `${dataRequestStats?.overdue} overdue data request${(dataRequestStats?.overdue ?? 0) > 1 ? "s" : ""}`, action: "/admin/dpdp-audit", color: "text-destructive", icon: Shield },
  ].filter(Boolean) as { label: string; action: string; color: string; icon: typeof Clock }[];

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: "Draft",
      pending_review: "Submitted for Review",
      pending_approval: "Pending Approval",
      approved: "Approved",
      rejected: "Rejected",
      sent_back: "Sent Back",
    };
    return map[status] || status;
  };

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="h-4 w-4" />;
    if (status === "rejected" || status === "sent_back") return <AlertTriangle className="h-4 w-4" />;
    return <FileSearch className="h-4 w-4" />;
  };

  const statusColor = (status: string) => {
    if (status === "approved") return "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]";
    if (status === "rejected") return "bg-destructive/10 text-destructive";
    if (status === "sent_back") return "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]";
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
          <h1>Vendor Verification Dashboard</h1>
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
      </div>
    </StaffLayout>
  );
}
