import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsRange } from "@/components/analytics/AnalyticsDateFilter";

export interface PaymentFlowStage {
  name: string;
  submitted: number;
  approved: number;
  settled: number;
  submittedCount: number;
}

export interface FlowTrendSeries {
  key: "pi" | "advance" | "invoice";
  name: string;
  submitted: number[];
  approved: number[];
}

interface VendorRef {
  vendor_id: string;
  vendors: { company_name: string } | null;
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * One combined view of the PI/Quotation -> Advance Request -> Invoice payment
 * flow, scoped by the same vendor + date filter across all three. Advance
 * Requests have no row-level link to the payment that eventually settles
 * them (vendor_invoice_payments.advance_adjusted is a lump sum), so "settled"
 * there is the total advance money adjusted for that vendor/period, not a
 * per-request match — the closest true figure the schema supports.
 */
export function useVendorPaymentFlow(range: AnalyticsRange, vendorFilter: string) {
  // Every row that has (or had) a PI: still at PI stage, or already turned into
  // its invoice (the PI details stay on the row).
  const { data: piRows = [], isLoading: piLoading } = useQuery({
    queryKey: ["payment-flow-pi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("id, vendor_id, status, pi_status, pi_amount, created_at, doc_stage, vendors(company_name)")
        .or("doc_stage.in.(proforma_invoice,quotation),pi_file_key.not.is.null");
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        vendor_id: r.vendor_id,
        status: (r.pi_status ?? r.status) as string,
        amount: r.pi_amount,
        created_at: r.created_at,
        vendors: r.vendors,
      }));
    },
  });

  // Advances: those held on the billing row, plus the earlier standalone requests.
  const { data: advanceRows = [], isLoading: advLoading } = useQuery({
    queryKey: ["payment-flow-advance"],
    queryFn: async () => {
      const [onRow, legacy] = await Promise.all([
        supabase
          .from("vendor_invoices")
          .select("id, vendor_id, adv_status, adv_amount, adv_requested_at, created_at, vendors(company_name)")
          .not("adv_status", "is", null),
        supabase.from("vendor_advance_requests").select("id, vendor_id, status, amount, created_at, vendors(company_name)"),
      ]);
      if (onRow.error) throw onRow.error;
      if (legacy.error) throw legacy.error;
      return [
        ...(onRow.data || []).map((r) => ({
          id: r.id,
          vendor_id: r.vendor_id,
          status: r.adv_status === "paid" ? "approved" : "pending",
          amount: r.adv_amount,
          created_at: r.adv_requested_at || r.created_at,
          vendors: r.vendors,
        })),
        ...(legacy.data || []),
      ];
    },
  });

  const { data: invoiceRows = [], isLoading: invLoading } = useQuery({
    queryKey: ["payment-flow-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("id, vendor_id, status, invoice_amount, invoice_date, vendors(company_name)")
        .eq("doc_stage", "invoice");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payments = [], isLoading: payLoading } = useQuery({
    queryKey: ["payment-flow-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoice_payments")
        .select("vendor_id, invoice_id, pi_quotation_id, total_settled, advance_adjusted, payment_date");
      if (error) throw error;
      return data || [];
    },
  });

  const computed = useMemo(() => {
    const fromIso = range.from ? localDay(range.from) : "0000-01-01";
    const toIso = range.to ? localDay(range.to) : "9999-12-31";
    const inRange = (iso: string | null | undefined) => {
      const d = (iso || "").slice(0, 10);
      return !!d && d >= fromIso && d <= toIso;
    };
    const scoped = <T extends { vendor_id: string }>(rows: T[]) =>
      vendorFilter === "all" ? rows : rows.filter((r) => r.vendor_id === vendorFilter);

    const settledByPi = new Map<string, number>();
    const settledByInvoice = new Map<string, number>();
    for (const p of payments) {
      if (p.pi_quotation_id) settledByPi.set(p.pi_quotation_id, (settledByPi.get(p.pi_quotation_id) || 0) + Number(p.total_settled || 0));
      if (p.invoice_id) settledByInvoice.set(p.invoice_id, (settledByInvoice.get(p.invoice_id) || 0) + Number(p.total_settled || 0));
    }
    const advanceSettled = scoped(payments)
      .filter((p) => inRange(p.payment_date))
      .reduce((s, p) => s + Number(p.advance_adjusted || 0), 0);

    const piScoped = scoped(piRows).filter((r) => inRange(r.created_at));
    const advScoped = scoped(advanceRows).filter((r) => inRange(r.created_at));
    const invScoped = scoped(invoiceRows).filter((r) => inRange(r.invoice_date));

    const pi: PaymentFlowStage = {
      name: "PI / Quotation",
      submitted: piScoped.reduce((s, r) => s + Number(r.amount || 0), 0),
      approved: piScoped.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.amount || 0), 0),
      settled: piScoped.reduce((s, r) => s + Math.min(Number(r.amount || 0), settledByPi.get(r.id) || 0), 0),
      submittedCount: piScoped.length,
    };

    const advance: PaymentFlowStage = {
      name: "Advance Request",
      submitted: advScoped.reduce((s, r) => s + Number(r.amount || 0), 0),
      approved: advScoped.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.amount || 0), 0),
      settled: advanceSettled,
      submittedCount: advScoped.length,
    };

    const invoice: PaymentFlowStage = {
      name: "Invoices",
      submitted: invScoped.reduce((s, r) => s + Number(r.invoice_amount || 0), 0),
      approved: invScoped
        .filter((r) => ["approved", "partially_paid", "paid"].includes(r.status))
        .reduce((s, r) => s + Number(r.invoice_amount || 0), 0),
      settled: invScoped.reduce((s, r) => s + Math.min(Number(r.invoice_amount || 0), settledByInvoice.get(r.id) || 0), 0),
      submittedCount: invScoped.length,
    };

    // union vendor list across all three sources, for the shared filter dropdown
    const vendorMap = new Map<string, string>();
    const collect = (rows: VendorRef[]) => {
      for (const r of rows) if (!vendorMap.has(r.vendor_id)) vendorMap.set(r.vendor_id, r.vendors?.company_name || "Unknown vendor");
    };
    collect(piRows as VendorRef[]);
    collect(advanceRows as VendorRef[]);
    collect(invoiceRows as VendorRef[]);
    const vendorOptions = Array.from(vendorMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // ── weekly trend, always the last 12 weeks (ignores the range/vendor filters — this
    // is the always-on headline chart, not the filtered deep-dive below it) ──
    const today = new Date();
    const weekStart = (d: Date) => {
      const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const day = (c.getDay() + 6) % 7;
      c.setDate(c.getDate() - day);
      return c;
    };
    const thisWeekStart = weekStart(today);
    const TREND_WEEKS = 12;
    const trendWeeks = Array.from({ length: TREND_WEEKS }, (_, idx) => {
      const w = TREND_WEEKS - 1 - idx;
      const start = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - w * 7);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { start, end, label: start.toLocaleString("en-IN", { day: "2-digit", month: "short" }) };
    });
    const toDate = (iso: string) => new Date((iso || "").slice(0, 10) + "T00:00:00");
    const weeklyCounts = <T extends { status: string }>(rows: T[], dateOf: (r: T) => string, approvedStatuses: string[]) => {
      const submitted = trendWeeks.map(() => 0);
      const approved = trendWeeks.map(() => 0);
      for (const r of rows) {
        const d = toDate(dateOf(r));
        const wi = trendWeeks.findIndex(({ start, end }) => d >= start && d <= end);
        if (wi === -1) continue;
        submitted[wi] += 1;
        if (approvedStatuses.includes(r.status)) approved[wi] += 1;
      }
      return { submitted, approved };
    };
    const piTrend = weeklyCounts(piRows, (r) => r.created_at, ["approved"]);
    const advanceTrend = weeklyCounts(advanceRows, (r) => r.created_at, ["approved"]);
    const invoiceTrend = weeklyCounts(invoiceRows, (r) => r.invoice_date, ["approved", "partially_paid", "paid"]);
    const flowTrend = {
      labels: trendWeeks.map((w) => w.label),
      series: [
        { key: "pi", name: "PI / Quotation", ...piTrend },
        { key: "advance", name: "Advance Request", ...advanceTrend },
        { key: "invoice", name: "Invoices", ...invoiceTrend },
      ] as FlowTrendSeries[],
    };

    return { stages: [pi, advance, invoice] as PaymentFlowStage[], vendorOptions, flowTrend };
  }, [piRows, advanceRows, invoiceRows, payments, range, vendorFilter]);

  return { ...computed, isLoading: piLoading || advLoading || invLoading || payLoading };
}
