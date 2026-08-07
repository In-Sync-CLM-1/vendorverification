import { Fragment, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceCharts } from "@/components/invoices/InvoiceCharts";
import { PaymentBreakupTable } from "@/components/invoices/PaymentBreakupTable";
import { InvoiceUploadDialog } from "@/components/invoices/InvoiceUploadDialog";
import { DetailChangeRequestDialog } from "@/components/vendor/DetailChangeRequestDialog";
import { AdvanceRequestDialog } from "@/components/vendor/AdvanceRequestDialog";
import { PiQuotationDialog } from "@/components/vendor/PiQuotationDialog";
import { DocumentUploadDialog, DocumentActionTarget } from "@/components/documents/DocumentUploadDialog";
import {
  formatINR,
  INVOICE_STATUS_META,
  openInvoiceFile,
  paymentSettled,
  VendorInvoice,
  InvoicePayment,
} from "@/lib/invoices";
import {
  FileText,
  XCircle,
  Clock,
  Landmark,
  Upload,
  LogOut,
  Loader2,
  ChevronDown,
  Paperclip,
  UserCog,
  AlertTriangle,
  RefreshCw,
  HandCoins,
} from "lucide-react";
import { toast } from "sonner";

// The deep link from a "please re-upload" email/WhatsApp points at
// /vendor/portal/dashboard?reupload=<document_id>. If the vendor isn't
// logged in yet, the OTP login round trip would otherwise drop that query
// param — stash it so it survives, and consume it once landed here.
const DEEPLINK_STORAGE_KEY = "vendor_portal_deeplink";

export default function VendorPortalDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userType, loading: authLoading, signOut } = useAuth();
  const { tenant } = useTenant();
  const tenantLogo = useTenantLogo();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [advanceRequestOpen, setAdvanceRequestOpen] = useState(false);
  const [piQuotationOpen, setPiQuotationOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documentTarget, setDocumentTarget] = useState<DocumentActionTarget | null>(null);

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ["portal-vendor", user?.id],
    queryFn: async () => {
      const { data: link } = await supabase
        .from("vendor_users")
        .select("vendor_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!link) return null;
      const { data } = await supabase
        .from("vendors")
        .select("id, company_name, vendor_code, current_status, category_id, tenant_id")
        .eq("id", link.vendor_id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: invoices = [], refetch: refetchInvoices, isLoading: invLoading } = useQuery({
    queryKey: ["portal-invoices", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as VendorInvoice[];
    },
    enabled: !!vendor?.id,
  });

  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ["portal-payments", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoice_payments")
        .select("*")
        .eq("vendor_id", vendor!.id)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data || []) as InvoicePayment[];
    },
    enabled: !!vendor?.id,
  });

  const { data: changeRequests = [], refetch: refetchChangeRequests } = useQuery({
    queryKey: ["portal-change-requests", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_detail_change_requests")
        .select("id, status, created_at, reviewed_at, review_comments")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!vendor?.id,
  });

  const { data: advanceRequests = [], refetch: refetchAdvanceRequests } = useQuery({
    queryKey: ["portal-advance-requests", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_advance_requests")
        .select("id, amount, activity_name, status, review_comments, project_name, created_at, ai_extracted_data, proforma_invoice_file_key")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        amount: number;
        activity_name: string;
        status: "pending" | "approved" | "rejected";
        review_comments: string | null;
        project_name: string | null;
        created_at: string;
        ai_extracted_data: {
          proforma_invoice?: {
            invoice_number?: string | null;
            invoice_date?: string | null;
            due_date?: string | null;
            po_number?: string | null;
          };
        } | null;
        proforma_invoice_file_key: string | null;
      }>;
    },
    enabled: !!vendor?.id,
  });

  const { data: piQuotations = [], refetch: refetchPiQuotations } = useQuery({
    queryKey: ["portal-pi-quotations", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_pi_quotations")
        .select("id, document_type, project_name, amount, status, review_comments, file_key, created_at")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        document_type: "proforma_invoice" | "quotation";
        project_name: string;
        amount: number | null;
        status: "submitted" | "approved" | "rejected";
        review_comments: string | null;
        file_key: string;
        created_at: string;
      }>;
    },
    enabled: !!vendor?.id,
  });

  const { data: requiredDocTypes = [] } = useQuery({
    queryKey: ["portal-category-documents", vendor?.category_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_documents")
        .select("document_type_id, is_mandatory, display_order, document_types (id, name)")
        .eq("category_id", vendor!.category_id)
        .order("display_order");
      if (error) throw error;
      return (data || []) as Array<{
        document_type_id: string;
        is_mandatory: boolean;
        display_order: number;
        document_types: { id: string; name: string } | null;
      }>;
    },
    enabled: !!vendor?.category_id,
  });

  const { data: vendorDocuments = [], refetch: refetchVendorDocuments, isFetched: vendorDocumentsFetched } = useQuery({
    queryKey: ["portal-vendor-documents", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_documents")
        .select("id, vendor_id, document_type_id, version_number, status, review_comments, created_at")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        vendor_id: string;
        document_type_id: string;
        version_number: number;
        status: string;
        review_comments: string | null;
        created_at: string;
      }>;
    },
    enabled: !!vendor?.id,
  });

  // One row per required document type: the vendor's most recent upload for
  // that type (created_at desc, so the first match wins), or none at all if
  // it's never been uploaded.
  const documentRows = requiredDocTypes.map((rt) => {
    const uploaded = vendorDocuments.find((d) => d.document_type_id === rt.document_type_id);
    return {
      document_type_id: rt.document_type_id,
      document_type_name: rt.document_types?.name || "Document",
      is_mandatory: rt.is_mandatory,
      document: uploaded || null,
    };
  });

  const attentionNeeded = documentRows.filter(
    (r) => r.document && (r.document.status === "reupload_requested" || r.document.status === "rejected")
  );

  // Auto-open the upload dialog if we arrived via a "please re-upload" deep
  // link, once the vendor's documents have loaded.
  useEffect(() => {
    const targetId = searchParams.get("reupload");
    if (!targetId || !vendorDocumentsFetched || !vendor) return;
    const match = vendorDocuments.find((d) => d.id === targetId);
    if (match) {
      const rt = requiredDocTypes.find((r) => r.document_type_id === match.document_type_id);
      setDocumentTarget({
        document_id: match.id,
        vendor_id: match.vendor_id,
        tenant_id: vendor.tenant_id,
        document_type_id: match.document_type_id,
        document_type_name: rt?.document_types?.name || "Document",
        version_number: match.version_number,
        review_comments: match.review_comments,
      });
    }
    searchParams.delete("reupload");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorDocumentsFetched]);

  if (!authLoading && !user) {
    if (searchParams.get("reupload")) {
      sessionStorage.setItem(DEEPLINK_STORAGE_KEY, `?${searchParams.toString()}`);
    }
    navigate("/vendor/portal", { replace: true });
    return null;
  }
  if (!authLoading && userType === "staff") {
    navigate("/staff/invoices", { replace: true });
    return null;
  }

  if (authLoading || vendorLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-3">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">No vendor account linked</p>
            <p className="text-sm text-muted-foreground">
              We couldn't find a vendor registered with your login. Please sign in with the
              email or WhatsApp number registered during empanelment.
            </p>
            <Button variant="outline" onClick={async () => { await signOut(); navigate("/vendor/portal"); }}>
              Try a different login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const settledByInvoice = new Map<string, number>();
  for (const p of payments) {
    settledByInvoice.set(p.invoice_id, (settledByInvoice.get(p.invoice_id) || 0) + paymentSettled(p));
  }

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.invoice_amount), 0);
  const totalSettled = payments.reduce((s, p) => s + paymentSettled(p), 0);
  const totalTds = payments.reduce((s, p) => s + Number(p.tds_amount || 0), 0);

  const outstandingInvoices = invoices.filter(
    (i) => !["rejected", "paid"].includes(i.status) && Number(i.invoice_amount) - (settledByInvoice.get(i.id) || 0) > 0
  );
  const outstanding = outstandingInvoices.reduce((s, i) => s + Number(i.invoice_amount) - (settledByInvoice.get(i.id) || 0), 0);

  const settledInvoices = invoices.filter((i) => (settledByInvoice.get(i.id) || 0) > 0);

  const rejectedInvoices = invoices.filter((i) => i.status === "rejected");
  const rejectedValue = rejectedInvoices.reduce((s, i) => s + Number(i.invoice_amount), 0);

  // Advance available = approved advances minus whatever has since been
  // adjusted off against invoice payments (the existing "Advance Adjusted"
  // field staff already fill in when recording a payment).
  const totalApprovedAdvance = advanceRequests
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalAdvanceAdjusted = payments.reduce((s, p) => s + Number(p.advance_adjusted || 0), 0);
  const advanceAvailable = Math.max(totalApprovedAdvance - totalAdvanceAdjusted, 0);

  // One combined, date-sequenced table: invoices and advance requests are
  // both financial events for this vendor, so they live in a single list
  // sorted by when each one actually happened (upload/request date) instead
  // of two separate tables. Advance amounts still aren't summed into the
  // invoice totals (see summary line below) since a request's amount and an
  // invoice's adjusted advance are different money — there's no link back
  // from one to the other to net them off without double-counting.
  const combinedRows = [
    ...invoices.map((inv) => {
      const invPayments = payments.filter((p) => p.invoice_id === inv.id);
      return {
        kind: "invoice" as const,
        id: inv.id,
        label: inv.invoice_number,
        uploadDate: inv.created_at,
        invoiceDate: inv.invoice_date as string | null,
        dueDate: inv.due_date as string | null,
        po: inv.po_number,
        invoiceFileKey: inv.invoice_file_key,
        poFileKey: inv.po_file_key,
        amount: Number(inv.invoice_amount),
        advance_payment: invPayments.reduce((s, p) => s + Number(p.advance_adjusted || 0), 0),
        tds_amount: invPayments.reduce((s, p) => s + Number(p.tds_amount || 0), 0),
        status: inv.status,
        description: inv.description,
        rejection_reason: inv.rejection_reason,
        payments: invPayments,
      };
    }),
    ...advanceRequests.map((r) => ({
      kind: "advance" as const,
      id: r.id,
      // Prefer the proforma invoice's own PI number as the reference — it's
      // what staff actually look up against; fall back to the free-text
      // activity name for requests submitted without a PI attached.
      label: r.ai_extracted_data?.proforma_invoice?.invoice_number || r.activity_name,
      activityName: r.activity_name,
      uploadDate: r.created_at,
      invoiceDate: r.ai_extracted_data?.proforma_invoice?.invoice_date || null,
      dueDate: r.ai_extracted_data?.proforma_invoice?.due_date || null,
      po: r.ai_extracted_data?.proforma_invoice?.po_number || null,
      invoiceFileKey: r.proforma_invoice_file_key,
      poFileKey: null,
      // The requested amount is this row's headline "Amount" — the Advance
      // Adjusted / TDS / Paid columns are about money actually MOVED against
      // an invoice, which hasn't happened yet for a request still pending or
      // just approved (that only shows up once staff net it against an
      // invoice, on that invoice's own row).
      amount: Number(r.amount),
      advance_payment: null as number | null,
      tds_amount: null as number | null,
      status: r.status,
      project_name: r.project_name,
      review_comments: r.review_comments,
      payments: [] as InvoicePayment[],
    })),
  ].sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());

  const tiles = [
    { label: "Invoiced", value: formatINR(totalInvoiced), count: invoices.length, icon: FileText },
    { label: "Outstanding", value: formatINR(Math.max(outstanding, 0)), count: outstandingInvoices.length, icon: Clock },
    { label: "Paid / Settled", value: formatINR(totalSettled), count: settledInvoices.length, icon: Landmark, sub: totalTds > 0 ? `incl. TDS ${formatINR(totalTds)}` : undefined },
    { label: "Rejected", value: formatINR(rejectedValue), count: rejectedInvoices.length, icon: XCircle, accent: rejectedInvoices.length > 0 },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src={tenantLogo} alt={tenant?.short_name || "Organization"} className="h-12 w-auto max-w-[160px] object-contain shrink-0 rounded" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{vendor.company_name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {tenant?.short_name ? `${tenant.short_name} · ` : ""}Vendor Portal · {vendor.vendor_code}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setChangeRequestOpen(true)} size="sm" variant="outline">
              <UserCog className="h-4 w-4 mr-2" /> Update My Details
            </Button>
            <Button onClick={() => setPiQuotationOpen(true)} size="sm" variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Submit PI / Quotation
            </Button>
            <Button onClick={() => setAdvanceRequestOpen(true)} size="sm" variant="outline">
              <HandCoins className="h-4 w-4 mr-2" /> Request Advance
            </Button>
            <Button onClick={() => setUploadOpen(true)} size="sm">
              <Upload className="h-4 w-4 mr-2" /> Upload Invoice
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <Card key={t.label} className={t.accent ? "border-red-200" : undefined}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <t.icon className={`h-4 w-4 ${t.accent ? "text-red-500" : ""}`} />
                  <p className="text-xs">{t.label}</p>
                </div>
                <p className={`text-xl font-bold ${t.accent ? "text-red-600" : ""}`}>{t.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.count} {t.count === 1 ? "invoice" : "invoices"}
                  {t.sub ? ` · ${t.sub}` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">
              Documents
              {attentionNeeded.length > 0 && (
                <Badge variant="outline" className="ml-2 border-orange-400 text-orange-700 bg-orange-50">
                  {attentionNeeded.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

        <TabsContent value="documents" className="mt-6">
        {/* Every required document for this vendor's category — upload
            whatever's missing, re-upload anything flagged or rejected. */}
        {documentRows.length > 0 && (
          <Card className={attentionNeeded.length > 0 ? "border-orange-200" : undefined}>
            <CardContent className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                {attentionNeeded.length > 0 && <AlertTriangle className="h-4 w-4 text-orange-600" />}
                My Documents
              </h2>
              <div className="space-y-2">
                {documentRows.map((r) => {
                  const status = r.document?.status;
                  const needsAttention = status === "reupload_requested" || status === "rejected";
                  const isMissing = !r.document;
                  const isApproved = status === "approved";
                  const rowClass = needsAttention
                    ? "border-orange-200 bg-orange-50"
                    : isMissing
                      ? r.is_mandatory
                        ? "border-amber-200 bg-amber-50"
                        : "border-border"
                      : isApproved
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-border";
                  const statusLabel = isMissing
                    ? r.is_mandatory
                      ? "Not uploaded (required)"
                      : "Not uploaded"
                    : status === "reupload_requested"
                      ? "Re-upload requested"
                      : status === "rejected"
                        ? "Rejected"
                        : status === "approved"
                          ? "Approved"
                          : status === "under_review"
                            ? "Under review"
                            : "Uploaded";
                  const statusClass = needsAttention
                    ? "text-orange-700"
                    : isMissing
                      ? r.is_mandatory
                        ? "text-amber-700"
                        : "text-muted-foreground"
                      : status === "approved"
                        ? "text-emerald-700"
                        : "text-muted-foreground";
                  return (
                    <div
                      key={r.document_type_id}
                      className={`flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2 ${rowClass}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.document_type_name}</p>
                        <p className={`text-xs mt-0.5 ${statusClass}`}>{statusLabel}</p>
                        {r.document?.review_comments && needsAttention && (
                          <p className="text-xs text-orange-700 mt-0.5">{r.document.review_comments}</p>
                        )}
                      </div>
                      {(isMissing || needsAttention || isApproved) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={
                            needsAttention
                              ? "shrink-0 border-orange-400 text-orange-700"
                              : isApproved
                                ? "shrink-0 border-emerald-400 text-emerald-700"
                                : "shrink-0"
                          }
                          onClick={() =>
                            setDocumentTarget({
                              document_id: r.document?.id || null,
                              vendor_id: vendor!.id,
                              tenant_id: vendor!.tenant_id,
                              document_type_id: r.document_type_id,
                              document_type_name: r.document_type_name,
                              version_number: r.document?.version_number || 0,
                              review_comments: r.document?.review_comments || null,
                            })
                          }
                        >
                          {isMissing ? (
                            <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload</>
                          ) : (
                            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-upload</>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        </TabsContent>

        <TabsContent value="overview" className="space-y-6 mt-6">
        {/* Pending/recent detail-change requests */}
        {changeRequests.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h2 className="font-semibold mb-3">Your Detail Change Requests</h2>
              <div className="space-y-2">
                {changeRequests.map((r) => {
                  const statusMeta =
                    r.status === "approved"
                      ? { label: "Applied", className: "bg-emerald-100 text-emerald-800 border-emerald-200" }
                      : r.status === "rejected"
                        ? { label: "Not Approved", className: "bg-red-100 text-red-800 border-red-200" }
                        : { label: "Pending Review", className: "bg-amber-100 text-amber-800 border-amber-200" };
                  return (
                    <div key={r.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Requested {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        {r.status === "rejected" && r.review_comments && (
                          <p className="text-xs text-destructive mt-0.5">{r.review_comments}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* PI / Quotation submissions */}
        {piQuotations.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h2 className="font-semibold mb-3">Your PI / Quotation Submissions</h2>
              <div className="space-y-2">
                {piQuotations.map((r) => {
                  const statusMeta =
                    r.status === "approved"
                      ? { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" }
                      : r.status === "rejected"
                        ? { label: "Not Approved", className: "bg-red-100 text-red-800 border-red-200" }
                        : { label: "Pending Review", className: "bg-amber-100 text-amber-800 border-amber-200" };
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {r.document_type === "quotation" ? "Quotation" : "Proforma Invoice"} · {r.project_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.amount != null ? formatINR(r.amount) : "Amount not detected"} · submitted{" "}
                          {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        {r.status === "rejected" && r.review_comments && (
                          <p className="text-xs text-destructive mt-0.5">{r.review_comments}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => openInvoiceFile(r.file_key).catch((err) => toast.error(err.message))}
                        >
                          <Paperclip className="h-3.5 w-3.5 mr-1" /> File
                        </Button>
                        <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analytics */}
        <InvoiceCharts
          invoices={invoices.map((i) => ({
            invoice_amount: Number(i.invoice_amount),
            invoice_date: i.invoice_date,
            status: i.status,
          }))}
          payments={payments.map((p) => ({
            payment_date: p.payment_date,
            advance_adjusted: Number(p.advance_adjusted),
            tds_amount: Number(p.tds_amount),
            payout_amount: Number(p.payout_amount),
          }))}
          advanceRequests={advanceRequests.map((r) => ({
            amount: Number(r.amount),
            status: r.status,
            created_at: r.created_at,
          }))}
        />

        {/* Invoices and advance requests, one table, newest first */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">Your Invoices &amp; Advances</h2>
                <p className="text-sm text-muted-foreground">
                  Tap an invoice to see its payment breakup
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                Invoiced: <span className="font-semibold text-foreground">{formatINR(totalInvoiced)}</span>
                {" · "}Settled: <span className="font-semibold text-foreground">{formatINR(totalSettled)}</span>
                {advanceAvailable > 0 && (
                  <>{" · "}Advance available: <span className="font-semibold text-foreground">{formatINR(advanceAvailable)}</span></>
                )}
              </span>
            </div>

            {invLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : combinedRows.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="font-medium">No invoices yet</p>
                <p className="text-sm text-muted-foreground">
                  Upload your first invoice to get paid.
                </p>
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" /> Upload Invoice
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">TDS</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedRows.map((r) => {
                      const isOpen = expandedId === r.id;
                      const advanceStatusMeta =
                        r.status === "approved"
                          ? { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" }
                          : r.status === "rejected"
                            ? { label: "Not Approved", className: "bg-red-100 text-red-800 border-red-200" }
                            : { label: "Pending Review", className: "bg-amber-100 text-amber-800 border-amber-200" };
                      return (
                        <Fragment key={`${r.kind}-${r.id}`}>
                          <TableRow
                            className={r.kind === "invoice" ? "cursor-pointer" : undefined}
                            onClick={() => r.kind === "invoice" && setExpandedId(isOpen ? null : r.id)}
                          >
                            <TableCell className="font-medium">
                              {r.kind === "invoice" ? r.label : `Advance: ${r.label}`}
                              {r.kind === "advance" && (
                                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                                  {r.activityName}{r.project_name ? ` · ${r.project_name}` : ""}
                                </p>
                              )}
                              {r.kind === "advance" && r.status === "rejected" && r.review_comments && (
                                <p className="text-xs text-destructive font-normal mt-0.5">{r.review_comments}</p>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {new Date(r.invoiceDate || r.uploadDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                            </TableCell>
                            <TableCell>{r.po || "—"}</TableCell>
                            <TableCell className="text-right font-medium">{r.amount != null ? formatINR(r.amount) : "—"}</TableCell>
                            <TableCell className="text-right">{r.advance_payment ? formatINR(r.advance_payment) : "—"}</TableCell>
                            <TableCell className="text-right">{r.tds_amount ? formatINR(r.tds_amount) : "—"}</TableCell>
                            <TableCell>
                              {r.kind === "invoice" ? (
                                <Badge variant="outline" className={INVOICE_STATUS_META[r.status].className}>
                                  {INVOICE_STATUS_META[r.status].label}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className={advanceStatusMeta.className}>{advanceStatusMeta.label}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {r.kind === "invoice" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInvoiceFile(r.invoiceFileKey).catch((err) => toast.error(err.message));
                                    }}
                                  >
                                    <Paperclip className="h-3.5 w-3.5 mr-1" /> Invoice
                                  </Button>
                                )}
                                {r.kind === "invoice" && r.poFileKey && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInvoiceFile(r.poFileKey!).catch((err) => toast.error(err.message));
                                    }}
                                  >
                                    <Paperclip className="h-3.5 w-3.5 mr-1" /> PO
                                  </Button>
                                )}
                                {r.kind === "advance" && r.invoiceFileKey && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInvoiceFile(r.invoiceFileKey!).catch((err) => toast.error(err.message));
                                    }}
                                  >
                                    <Paperclip className="h-3.5 w-3.5 mr-1" /> PI
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {r.kind === "invoice" && (
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              )}
                            </TableCell>
                          </TableRow>
                          {r.kind === "invoice" && isOpen && (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={10} className="p-4">
                                {r.status === "rejected" && r.rejection_reason && (
                                  <p className="text-sm text-destructive mb-3">
                                    Rejection reason: {r.rejection_reason}
                                  </p>
                                )}
                                {r.description && (
                                  <p className="text-sm text-muted-foreground mb-3">{r.description}</p>
                                )}
                                <p className="text-sm font-medium mb-2">Payment details</p>
                                <PaymentBreakupTable payments={r.payments} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>
        </Tabs>
      </main>

      <InvoiceUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        vendorId={vendor.id}
        advanceRequests={advanceRequests}
        advanceAvailable={advanceAvailable}
        onUploaded={() => {
          refetchInvoices();
          refetchPayments();
        }}
      />

      <DetailChangeRequestDialog
        open={changeRequestOpen}
        onOpenChange={setChangeRequestOpen}
        vendorId={vendor.id}
        onSubmitted={refetchChangeRequests}
      />

      <AdvanceRequestDialog
        open={advanceRequestOpen}
        onOpenChange={setAdvanceRequestOpen}
        vendorId={vendor.id}
        pendingRequests={advanceRequests.filter((r) => r.status === "pending")}
        onSubmitted={refetchAdvanceRequests}
      />

      <PiQuotationDialog
        open={piQuotationOpen}
        onOpenChange={setPiQuotationOpen}
        vendorId={vendor.id}
        onSubmitted={refetchPiQuotations}
      />

      <DocumentUploadDialog
        document={documentTarget}
        onOpenChange={(open) => { if (!open) setDocumentTarget(null); }}
        onUploaded={refetchVendorDocuments}
      />
    </div>
  );
}
