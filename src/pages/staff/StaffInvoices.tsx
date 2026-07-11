import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentBreakupTable } from "@/components/invoices/PaymentBreakupTable";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
import {
  formatINR,
  INVOICE_STATUS_META,
  InvoiceStatus,
  openInvoiceFile,
  paymentSettled,
  VendorInvoice,
  InvoicePayment,
} from "@/lib/invoices";
import {
  ReceiptIndianRupee,
  Clock,
  CheckCircle2,
  Landmark,
  Loader2,
  Paperclip,
  Search,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

type InvoiceWithVendor = VendorInvoice & {
  vendors: { company_name: string; vendor_code: string | null } | null;
};

const TAB_FILTERS: Record<string, InvoiceStatus[] | undefined> = {
  all: undefined,
  submitted: ["submitted", "under_review"],
  approved: ["approved", "partially_paid"],
  paid: ["paid"],
  rejected: ["rejected"],
};

export default function StaffInvoices() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InvoiceWithVendor | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["staff-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*, vendors(company_name, vendor_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as InvoiceWithVendor[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["staff-invoice-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoice_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data || []) as InvoicePayment[];
    },
  });

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["staff-invoice-payments"] });
  };

  const settledByInvoice = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.invoice_id, (m.get(p.invoice_id) || 0) + paymentSettled(p));
    return m;
  }, [payments]);

  const filtered = useMemo(() => {
    const statuses = TAB_FILTERS[activeTab];
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statuses && !statuses.includes(inv.status)) return false;
      if (!q) return true;
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.vendors?.company_name || "").toLowerCase().includes(q) ||
        (inv.vendors?.vendor_code || "").toLowerCase().includes(q) ||
        (inv.po_number || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, activeTab, search]);

  // KPI tiles
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const awaitingReview = invoices.filter((i) => ["submitted", "under_review"].includes(i.status));
  const awaitingPayment = invoices.filter((i) => ["approved", "partially_paid"].includes(i.status));
  const awaitingPaymentValue = awaitingPayment.reduce(
    (s, i) => s + Number(i.invoice_amount) - (settledByInvoice.get(i.id) || 0),
    0
  );
  const paidThisMonth = payments
    .filter((p) => (p.payment_date || "").startsWith(monthKey))
    .reduce((s, p) => s + paymentSettled(p), 0);
  const tdsTotal = payments.reduce((s, p) => s + Number(p.tds_amount || 0), 0);

  const updateStatus = async (invoice: InvoiceWithVendor, status: InvoiceStatus, reason?: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("vendor_invoices")
        .update({
          status,
          rejection_reason: reason || null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);
      if (error) throw new Error(error.message);
      toast.success(
        status === "approved"
          ? "Invoice approved for payment"
          : status === "rejected"
            ? "Invoice rejected"
            : "Invoice moved to review"
      );
      setRejectReason("");
      setSelected(null);
      refetchAll();
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setActionLoading(false);
    }
  };

  const tiles = [
    { label: "Awaiting Review", value: String(awaitingReview.length), icon: Clock },
    { label: "Approved, Unpaid", value: formatINR(Math.max(awaitingPaymentValue, 0)), sub: `${awaitingPayment.length} invoice${awaitingPayment.length === 1 ? "" : "s"}`, icon: CheckCircle2 },
    { label: "Paid This Month", value: formatINR(paidThisMonth), icon: Landmark },
    { label: "TDS Deducted (total)", value: formatINR(tdsTotal), icon: ReceiptIndianRupee },
  ];

  const selectedPayments = selected ? payments.filter((p) => p.invoice_id === selected.id) : [];
  const selectedSettled = selected ? settledByInvoice.get(selected.id) || 0 : 0;

  return (
    <StaffLayout title="Invoices">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Vendor Invoices & Payments</h1>
          <p className="text-sm text-muted-foreground">
            Review invoices uploaded by approved vendors and record payments with the
            advance / GST / TDS / payout breakup
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <Card key={t.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <t.icon className="h-4 w-4" />
                    <p className="text-xs">{t.label}</p>
                  </div>
                  <p className="text-xl font-bold">{t.value}</p>
                  {t.sub && <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="submitted">To Review</TabsTrigger>
                <TabsTrigger value="approved">To Pay</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendor, invoice or PO number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="font-medium">No invoices found</p>
                  <p className="text-sm text-muted-foreground">
                    Invoices uploaded by approved vendors on their portal will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Settled</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv) => {
                        const meta = INVOICE_STATUS_META[inv.status];
                        const settled = settledByInvoice.get(inv.id) || 0;
                        return (
                          <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelected(inv)}>
                            <TableCell>
                              <p className="font-medium">{inv.vendors?.company_name || "—"}</p>
                              <p className="text-xs text-muted-foreground">{inv.vendors?.vendor_code}</p>
                            </TableCell>
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invoice detail dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Invoice {selected.invoice_number}
                <Badge variant="outline" className={INVOICE_STATUS_META[selected.status].className}>
                  {INVOICE_STATUS_META[selected.status].label}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {selected.vendors?.company_name} ({selected.vendors?.vendor_code}) ·{" "}
                {new Date(selected.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Invoice Amount</p>
                  <p className="font-semibold">{formatINR(Number(selected.invoice_amount))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">GST Portion</p>
                  <p className="font-semibold">{formatINR(Number(selected.gst_amount))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Settled</p>
                  <p className="font-semibold">{formatINR(selectedSettled)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">PO Number</p>
                  <p className="font-semibold">{selected.po_number || "—"}</p>
                </div>
              </div>

              {selected.description && (
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              )}
              {selected.status === "rejected" && selected.rejection_reason && (
                <p className="text-sm text-destructive">Rejection reason: {selected.rejection_reason}</p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openInvoiceFile(selected.invoice_file_key).catch((e) => toast.error(e.message))}
                >
                  <Paperclip className="h-4 w-4 mr-1" /> View Invoice
                </Button>
                {selected.po_file_key && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInvoiceFile(selected.po_file_key!).catch((e) => toast.error(e.message))}
                  >
                    <Paperclip className="h-4 w-4 mr-1" /> View PO
                  </Button>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Payments</p>
                <PaymentBreakupTable payments={selectedPayments} />
              </div>

              {/* Actions */}
              <div className="border-t pt-4 space-y-3">
                {["submitted", "under_review"].includes(selected.status) && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {selected.status === "submitted" && (
                        <Button variant="outline" disabled={actionLoading} onClick={() => updateStatus(selected, "under_review")}>
                          Start Review
                        </Button>
                      )}
                      <Button disabled={actionLoading} onClick={() => updateStatus(selected, "approved")}>
                        Approve for Payment
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={actionLoading || !rejectReason.trim()}
                        onClick={() => updateStatus(selected, "rejected", rejectReason.trim())}
                      >
                        Reject
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reject-reason" className="text-xs text-muted-foreground">
                        Rejection reason (required to reject)
                      </Label>
                      <Textarea
                        id="reject-reason"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        placeholder="e.g. amount does not match PO"
                      />
                    </div>
                  </>
                )}

                {["approved", "partially_paid"].includes(selected.status) && (
                  <Button disabled={actionLoading} onClick={() => setPayOpen(true)}>
                    <Landmark className="h-4 w-4 mr-2" /> Record Payment
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selected && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          invoice={selected}
          alreadySettled={selectedSettled}
          onRecorded={() => {
            setSelected(null);
            refetchAll();
          }}
        />
      )}
    </StaffLayout>
  );
}
