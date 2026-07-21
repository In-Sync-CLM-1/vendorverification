import { Fragment, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { DocumentReuploadDialog, ReuploadTargetDocument } from "@/components/documents/DocumentReuploadDialog";
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reuploadTarget, setReuploadTarget] = useState<ReuploadTargetDocument | null>(null);

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
        .select("id, company_name, vendor_code, current_status")
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

  const { data: flaggedDocuments = [], refetch: refetchFlaggedDocuments, isFetched: flaggedDocumentsFetched } = useQuery({
    queryKey: ["portal-flagged-documents", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_documents")
        .select("id, vendor_id, document_type_id, version_number, review_comments, document_types (name)")
        .eq("vendor_id", vendor!.id)
        .eq("status", "reupload_requested")
        .order("reviewed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        vendor_id: string;
        document_type_id: string;
        version_number: number;
        review_comments: string | null;
        document_types: { name: string } | null;
      }>;
    },
    enabled: !!vendor?.id,
  });

  // Auto-open the re-upload dialog if we arrived via a "please re-upload"
  // deep link, once the flagged-document list has loaded.
  useEffect(() => {
    const targetId = searchParams.get("reupload");
    if (!targetId || !flaggedDocumentsFetched) return;
    const match = flaggedDocuments.find((d) => d.id === targetId);
    if (match) {
      setReuploadTarget({
        id: match.id,
        vendor_id: match.vendor_id,
        document_type_id: match.document_type_id,
        document_type_name: match.document_types?.name || "Document",
        version_number: match.version_number,
        review_comments: match.review_comments,
      });
    }
    searchParams.delete("reupload");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flaggedDocumentsFetched]);

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
          <div className="min-w-0">
            <p className="font-semibold truncate">{vendor.company_name}</p>
            <p className="text-xs text-muted-foreground">
              Vendor Portal · {vendor.vendor_code}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setChangeRequestOpen(true)} size="sm" variant="outline">
              <UserCog className="h-4 w-4 mr-2" /> Update My Details
            </Button>
            <Button onClick={() => setUploadOpen(true)} size="sm">
              <Upload className="h-4 w-4 mr-2" /> Upload Invoice
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/vendor/portal");
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

        {/* Documents staff have flagged for re-upload */}
        {flaggedDocuments.length > 0 && (
          <Card className="border-orange-200">
            <CardContent className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2 text-orange-700">
                <AlertTriangle className="h-4 w-4" /> Documents Needing Your Attention
              </h2>
              <div className="space-y-2">
                {flaggedDocuments.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 text-sm border border-orange-200 bg-orange-50 rounded-md px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.document_types?.name || "Document"}</p>
                      {d.review_comments && (
                        <p className="text-xs text-orange-700 mt-0.5">{d.review_comments}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-orange-400 text-orange-700"
                      onClick={() =>
                        setReuploadTarget({
                          id: d.id,
                          vendor_id: d.vendor_id,
                          document_type_id: d.document_type_id,
                          document_type_name: d.document_types?.name || "Document",
                          version_number: d.version_number,
                          review_comments: d.review_comments,
                        })
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-upload
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
        />

        {/* Invoice list */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Your Invoices</h2>
                <p className="text-sm text-muted-foreground">
                  Tap an invoice to see its payment breakup
                </p>
              </div>
            </div>

            {invLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : invoices.length === 0 ? (
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
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Settled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const meta = INVOICE_STATUS_META[inv.status];
                      const settled = settledByInvoice.get(inv.id) || 0;
                      const invPayments = payments.filter((p) => p.invoice_id === inv.id);
                      const isOpen = expandedId === inv.id;
                      return (
                        <Fragment key={inv.id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => setExpandedId(isOpen ? null : inv.id)}
                          >
                                <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {new Date(inv.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                </TableCell>
                                <TableCell>{inv.po_number || "—"}</TableCell>
                                <TableCell className="text-right font-medium">{formatINR(Number(inv.invoice_amount))}</TableCell>
                                <TableCell className="text-right">{settled > 0 ? formatINR(settled) : "—"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openInvoiceFile(inv.invoice_file_key).catch((err) => toast.error(err.message));
                                      }}
                                    >
                                      <Paperclip className="h-3.5 w-3.5 mr-1" /> Invoice
                                    </Button>
                                    {inv.po_file_key && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openInvoiceFile(inv.po_file_key!).catch((err) => toast.error(err.message));
                                        }}
                                      >
                                        <Paperclip className="h-3.5 w-3.5 mr-1" /> PO
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={8} className="p-4">
                                {inv.status === "rejected" && inv.rejection_reason && (
                                  <p className="text-sm text-destructive mb-3">
                                    Rejection reason: {inv.rejection_reason}
                                  </p>
                                )}
                                {inv.description && (
                                  <p className="text-sm text-muted-foreground mb-3">{inv.description}</p>
                                )}
                                <p className="text-sm font-medium mb-2">Payment details</p>
                                <PaymentBreakupTable payments={invPayments} />
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
      </main>

      <InvoiceUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        vendorId={vendor.id}
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

      <DocumentReuploadDialog
        document={reuploadTarget}
        onOpenChange={(open) => { if (!open) setReuploadTarget(null); }}
        onUploaded={refetchFlaggedDocuments}
      />
    </div>
  );
}
