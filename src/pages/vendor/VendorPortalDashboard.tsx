import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceCharts } from "@/components/invoices/InvoiceCharts";
import { DetailChangeRequestDialog } from "@/components/vendor/DetailChangeRequestDialog";
import { DocumentUploadDialog, DocumentActionTarget } from "@/components/documents/DocumentUploadDialog";
import { BillingTable } from "@/components/billing/BillingTable";
import { SubmitPiDialog } from "@/components/billing/dialogs/SubmitPiDialog";
import { UploadInvoiceDialog } from "@/components/billing/dialogs/UploadInvoiceDialog";
import { RequestAdvanceDialog, RaiseCreditNoteDialog } from "@/components/billing/dialogs/SmallDialogs";
import { OnboardingJourney } from "@/components/vendor/OnboardingJourney";
import { useBillingRows } from "@/hooks/useBillingRows";
import { AchievementShelf, ScoreStrip, useVendorGame } from "@/components/game/VendorGame";
import { BillingRow, balanceOf, isInvoice, paymentsOf, settledTotal, tdsTotal } from "@/lib/billing";
import { formatINR } from "@/lib/invoices";
import {
  FileText,
  XCircle,
  Clock,
  Landmark,
  Upload,
  LogOut,
  Loader2,
  UserCog,
  AlertTriangle,
  RefreshCw,
  Percent,
} from "lucide-react";
import { UrlTabs } from "@/components/UrlTabs";

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
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [piOpen, setPiOpen] = useState(false);
  const [resubmitRow, setResubmitRow] = useState<BillingRow | null>(null);
  const [advanceRow, setAdvanceRow] = useState<BillingRow | null>(null);
  const [invoiceRow, setInvoiceRow] = useState<BillingRow | null>(null);
  const [creditRow, setCreditRow] = useState<BillingRow | null>(null);
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
        .select("id, company_name, vendor_code, current_status, category_id, tenant_id, sent_back_reason, rejection_reason, approved_at")
        .eq("id", link.vendor_id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Billing is a separate flow that opens once the vendor is approved.
  const approved = vendor?.current_status === "approved";

  // Standalone advance requests made before advances moved onto the billing row.
  const { data: earlierAdvances = [] } = useQuery({
    queryKey: ["portal-earlier-advances", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_advance_requests")
        .select("id, amount, status, activity_name, created_at")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!vendor?.id && approved,
  });
  const { rows, isLoading: rowsLoading, refresh } = useBillingRows(`vendor:${vendor?.id}`, !!vendor?.id && approved);
  const game = useVendorGame(vendor?.id, rows, approved, !!vendor?.id && approved && !rowsLoading);

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
    navigate("/staff/vendor-payments", { replace: true });
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

  const invoiceRows = rows.filter(isInvoice);
  const totalInvoiced = invoiceRows.reduce((s, r) => s + Number(r.invoice_amount || 0), 0);
  const totalSettled = invoiceRows.reduce((s, r) => s + settledTotal(r), 0);
  const totalTds = invoiceRows.reduce((s, r) => s + tdsTotal(r), 0);
  const totalBalance = invoiceRows.reduce((s, r) => s + (balanceOf(r) ?? 0), 0);

  const tiles = [
    { label: "Invoiced", value: formatINR(totalInvoiced), sub: `${invoiceRows.length} ${invoiceRows.length === 1 ? "invoice" : "invoices"}`, icon: FileText },
    { label: "Settled", value: formatINR(totalSettled), sub: "paid, TDS and advance", icon: Landmark },
    { label: "TDS deducted", value: formatINR(totalTds), sub: "across all payments", icon: Percent },
    { label: "Balance", value: formatINR(totalBalance), sub: "still to be paid", icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-muted/30 font-jakarta">
      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div
          className="relative overflow-hidden rounded-3xl p-5 text-white"
          style={{ background: "radial-gradient(120% 150% at 0% 0%, #0B2545 0%, #0A3F73 55%, #0066B3 105%)" }}
        >
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,187,68,.38), transparent 66%)" }} />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={tenantLogo} alt={tenant?.short_name || "Organization"} className="h-11 w-auto max-w-[150px] shrink-0 rounded-lg bg-white object-contain p-1" />
              <div className="min-w-0">
                <p className="truncate text-[17px] font-bold">{vendor.company_name}</p>
                <p className="truncate text-xs text-blue-200">
                  {tenant?.short_name ? `${tenant.short_name} · ` : ""}Vendor Portal · {vendor.vendor_code}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setChangeRequestOpen(true)} size="sm" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <UserCog className="mr-2 h-4 w-4" /> Update My Details
              </Button>
              {approved && (
                <Button onClick={() => setPiOpen(true)} size="sm" className="bg-white text-[#0B2545] hover:bg-blue-50">
                  <FileText className="mr-2 h-4 w-4" /> Submit PI / Quotation
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Sign out"
                className="text-white hover:bg-white/15 hover:text-white"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {approved && (
            <div className="relative mt-4">
              <ScoreStrip xp={game.xp} level={game.level} streak={game.streak} gained={game.gained} />
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {approved && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <Card key={t.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <t.icon className="h-4 w-4" />
                    <p className="text-xs">{t.label}</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums">{t.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {approved && <AchievementShelf achievements={game.achievements} justEarned={game.justEarned} />}

        <UrlTabs param="vendorportaldashboard_tab" defaultValue={approved ? "billing" : "onboarding"}>
          <TabsList>
            {approved ? (
              <>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
            )}
            <TabsTrigger value="documents">
              Documents
              {attentionNeeded.length > 0 && (
                <Badge variant="outline" className="ml-2 border-orange-400 text-orange-700 bg-orange-50">
                  {attentionNeeded.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

        {!approved && (
          <TabsContent value="onboarding" className="mt-6">
            <OnboardingJourney
              status={vendor.current_status}
              note={vendor.current_status === "rejected" ? vendor.rejection_reason : vendor.sent_back_reason}
              needsDocuments={attentionNeeded.length > 0}
            />
          </TabsContent>
        )}

        {approved && (
          <TabsContent value="billing" className="mt-6 space-y-3">
            {earlierAdvances.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h2 className="mb-2 text-sm font-semibold">Earlier advance requests</h2>
                  <div className="space-y-1.5">
                    {earlierAdvances.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate">{r.activity_name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <b className="tabular-nums">{formatINR(Number(r.amount))}</b>
                          <Badge variant="outline" className={r.status === "approved" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : r.status === "rejected" ? "border-red-200 bg-red-100 text-red-800" : "border-amber-200 bg-amber-100 text-amber-800"}>
                            {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Not approved" : "Pending review"}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <BillingTable
              rows={rows}
              loading={rowsLoading}
              viewer={{ mode: "vendor", userId: user?.id ?? null, isAdmin: false, isAccounts: false, isViewOnly: false }}
              actions={{
                resubmit: (r) => setResubmitRow(r),
                requestAdvance: (r) => setAdvanceRow(r),
                uploadInvoice: (r) => setInvoiceRow(r),
                raiseCreditNote: (r) => setCreditRow(r),
                decide: () => {},
                issuePo: () => {},
                recordAdvance: () => {},
                recordPayment: () => {},
              }}
              emptyTitle="No PIs yet"
              emptyHint="Submit a PI or Quotation to start your first job. Everything that follows, from the PO to the invoice, appears on the same row."
            />
          </TabsContent>
        )}

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


        {/* Analytics */}
        <InvoiceCharts
          invoices={invoiceRows.map((i) => ({
            invoice_amount: Number(i.invoice_amount),
            invoice_date: i.invoice_date as string,
            status: i.status,
          }))}
          payments={rows.flatMap((r) => paymentsOf(r)).map((p) => ({
            payment_date: p.payment_date,
            advance_adjusted: Number(p.advance_adjusted),
            tds_amount: Number(p.tds_amount),
            payout_amount: Number(p.payout_amount),
          }))}
          advanceRequests={rows
            .filter((r) => r.adv_status)
            .map((r) => ({
              amount: Number(r.adv_amount),
              status: (r.adv_status === "paid" ? "approved" : "pending") as "approved" | "pending" | "rejected",
              created_at: r.adv_requested_at || r.created_at,
            }))}
        />
        </TabsContent>
        </UrlTabs>
      </main>

      <SubmitPiDialog
        open={piOpen || !!resubmitRow}
        onOpenChange={(o) => { if (!o) { setPiOpen(false); setResubmitRow(null); } }}
        vendorId={vendor.id}
        resubmitRow={resubmitRow}
        onDone={refresh}
      />
      <UploadInvoiceDialog open={!!invoiceRow} onOpenChange={(o) => !o && setInvoiceRow(null)} row={invoiceRow} onDone={refresh} />
      <RequestAdvanceDialog open={!!advanceRow} onOpenChange={(o) => !o && setAdvanceRow(null)} row={advanceRow} onDone={refresh} />
      <RaiseCreditNoteDialog open={!!creditRow} onOpenChange={(o) => !o && setCreditRow(null)} row={creditRow} onDone={refresh} />

      <DetailChangeRequestDialog
        open={changeRequestOpen}
        onOpenChange={setChangeRequestOpen}
        vendorId={vendor.id}
        onSubmitted={refetchChangeRequests}
      />

      <DocumentUploadDialog
        document={documentTarget}
        onOpenChange={(open) => { if (!open) setDocumentTarget(null); }}
        onUploaded={refetchVendorDocuments}
      />
    </div>
  );
}
