import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InvoicePayment, InvoiceStatus, VendorInvoice, paymentSettled } from "@/lib/invoices";
import type { AnalyticsRange } from "@/components/analytics/AnalyticsDateFilter";

export type InvoiceWithVendor = VendorInvoice & {
  vendors: { company_name: string; vendor_code: string | null } | null;
};

const DAY = 24 * 60 * 60 * 1000;

const ym = (iso: string | null | undefined) => (iso || "").slice(0, 7);
const toDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));

/** Whole days from an ISO date to now. */
export const ageDays = (iso: string) => Math.floor((Date.now() - toDate(iso).getTime()) / DAY);

/** Month keys (YYYY-MM) covering [from, to] inclusive. */
function monthKeys(from: Date, to: Date): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (d <= end) {
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export interface AgingBucket {
  label: string;
  min: number;
  max: number | null;
}
export const AGING_BUCKETS: AgingBucket[] = [
  { label: "0–30 days", min: 0, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: null },
];

export const bucketIndex = (days: number) =>
  days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;

const OPEN_STATUSES: InvoiceStatus[] = ["submitted", "under_review", "approved", "partially_paid"];

export function useInvoiceAnalytics(range: AnalyticsRange, vendorFilter: string) {
  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ["analytics-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*, vendors(company_name, vendor_code)")
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return (data || []) as InvoiceWithVendor[];
    },
  });

  const { data: payments = [], isLoading: payLoading } = useQuery({
    queryKey: ["analytics-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoice_payments")
        .select("*")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return (data || []) as InvoicePayment[];
    },
  });

  const computed = useMemo(() => {
    // ── vendor scope (applies to everything) ──
    const vInvoices = vendorFilter === "all" ? invoices : invoices.filter((i) => i.vendor_id === vendorFilter);
    const vPayments = vendorFilter === "all" ? payments : payments.filter((p) => p.vendor_id === vendorFilter);

    // settled per invoice, from ALL payments (needed for outstanding)
    const settledByInvoice = new Map<string, number>();
    const lastPayByInvoice = new Map<string, string>();
    for (const p of vPayments) {
      settledByInvoice.set(p.invoice_id, (settledByInvoice.get(p.invoice_id) || 0) + paymentSettled(p));
      const prev = lastPayByInvoice.get(p.invoice_id);
      if (!prev || p.payment_date > prev) lastPayByInvoice.set(p.invoice_id, p.payment_date);
    }

    const outstandingOf = (inv: InvoiceWithVendor) =>
      inv.status === "paid" || inv.status === "rejected"
        ? 0
        : Math.max(0, Number(inv.invoice_amount) - (settledByInvoice.get(inv.id) || 0));

    // ── date scope (flow metrics) ──
    const localDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const fromIso = range.from ? localDay(range.from) : "0000";
    const toIso = range.to ? localDay(range.to) : "9999";
    const inRange = (iso: string | null | undefined) => !!iso && iso >= fromIso && iso <= toIso;

    const rangeInvoices = vInvoices.filter((i) => inRange(i.invoice_date));
    const rangePayments = vPayments.filter((p) => inRange(p.payment_date));

    // effective month axis (for "all time", derive span from the data)
    const today = new Date();
    let axisFrom = range.from, axisTo = range.to || today;
    if (!axisFrom) {
      const first = vInvoices[0]?.invoice_date || vPayments[0]?.payment_date;
      axisFrom = first ? toDate(first) : new Date(today.getFullYear(), today.getMonth() - 5, 1);
    }
    const months = monthKeys(axisFrom, axisTo);
    const monthIdx = new Map(months.map((m, i) => [m.key, i]));

    // ── cash motion: monthly invoiced/settled + running outstanding ──
    const invoicedByMonth = new Array(months.length).fill(0);
    const settledByMonth = new Array(months.length).fill(0);
    for (const i of vInvoices) {
      if (i.status === "rejected") continue;
      const idx = monthIdx.get(ym(i.invoice_date));
      if (idx !== undefined) invoicedByMonth[idx] += Number(i.invoice_amount);
    }
    for (const p of vPayments) {
      const idx = monthIdx.get(ym(p.payment_date));
      if (idx !== undefined) settledByMonth[idx] += paymentSettled(p);
    }
    // running balance needs pre-axis history
    const axisStartKey = months[0]?.key || "9999";
    let preInvoiced = 0, preSettled = 0;
    for (const i of vInvoices) if (i.status !== "rejected" && ym(i.invoice_date) < axisStartKey) preInvoiced += Number(i.invoice_amount);
    for (const p of vPayments) if (ym(p.payment_date) < axisStartKey) preSettled += paymentSettled(p);
    const runningOutstanding: number[] = [];
    let bal = preInvoiced - preSettled;
    for (let m = 0; m < months.length; m++) {
      bal += invoicedByMonth[m] - settledByMonth[m];
      runningOutstanding.push(Math.max(0, Math.round(bal)));
    }

    // ── KPIs + prev-window deltas ──
    const invoicedInRange = rangeInvoices.filter((i) => i.status !== "rejected").reduce((s, i) => s + Number(i.invoice_amount), 0);
    const settledInRange = rangePayments.reduce((s, p) => s + paymentSettled(p), 0);
    const outstandingNow = vInvoices.reduce((s, i) => s + outstandingOf(i), 0);

    let invoicedPrev: number | null = null, settledPrev: number | null = null;
    if (range.from && range.to) {
      const len = range.to.getTime() - range.from.getTime() + DAY;
      const pFrom = new Date(range.from.getTime() - len).toISOString().slice(0, 10);
      const pTo = new Date(range.from.getTime() - DAY).toISOString().slice(0, 10);
      invoicedPrev = vInvoices
        .filter((i) => i.status !== "rejected" && i.invoice_date >= pFrom && i.invoice_date <= pTo)
        .reduce((s, i) => s + Number(i.invoice_amount), 0);
      settledPrev = vPayments
        .filter((p) => p.payment_date >= pFrom && p.payment_date <= pTo)
        .reduce((s, p) => s + paymentSettled(p), 0);
    }

    // avg days to pay: invoices fully paid, final payment inside the range
    const paidInRange = vInvoices.filter((i) => i.status === "paid" && inRange(lastPayByInvoice.get(i.id)));
    const daysToPay = paidInRange.map((i) => {
      const last = lastPayByInvoice.get(i.id)!;
      return Math.max(0, Math.round((toDate(last).getTime() - toDate(i.invoice_date).getTime()) / DAY));
    });
    const avgDaysToPay = daysToPay.length ? Math.round(daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length) : null;

    // ── pipeline by status (₹, range cohort) ──
    const pipelineOrder: InvoiceStatus[] = ["submitted", "under_review", "approved", "partially_paid", "paid"];
    const pipeline = pipelineOrder.map((s) => ({
      status: s,
      amount: rangeInvoices.filter((i) => i.status === s).reduce((sum, i) => sum + Number(i.invoice_amount), 0),
      count: rangeInvoices.filter((i) => i.status === s).length,
    }));
    const rejected = rangeInvoices.filter((i) => i.status === "rejected");
    const rejectedAmount = rejected.reduce((s, i) => s + Number(i.invoice_amount), 0);

    // ── settlement composition per month (range) ──
    const compPayout = new Array(months.length).fill(0);
    const compTds = new Array(months.length).fill(0);
    const compAdvance = new Array(months.length).fill(0);
    for (const p of rangePayments) {
      const idx = monthIdx.get(ym(p.payment_date));
      if (idx === undefined) continue;
      compPayout[idx] += Number(p.payout_amount || 0);
      compTds[idx] += Number(p.tds_amount || 0);
      compAdvance[idx] += Number(p.advance_adjusted || 0);
    }

    // ── per-vendor rollups (range cohort; settled = against the cohort) ──
    interface VendorAgg {
      vendorId: string;
      name: string;
      code: string;
      count: number;
      invoiced: number;
      settled: number;
      outstanding: number;
      oldestUnpaidDays: number | null;
    }
    const byVendor = new Map<string, VendorAgg>();
    for (const i of rangeInvoices) {
      if (i.status === "rejected") continue;
      let v = byVendor.get(i.vendor_id);
      if (!v) {
        v = {
          vendorId: i.vendor_id,
          name: i.vendors?.company_name || "Unknown vendor",
          code: i.vendors?.vendor_code || "",
          count: 0, invoiced: 0, settled: 0, outstanding: 0, oldestUnpaidDays: null,
        };
        byVendor.set(i.vendor_id, v);
      }
      v.count += 1;
      v.invoiced += Number(i.invoice_amount);
      v.settled += Math.min(Number(i.invoice_amount), settledByInvoice.get(i.id) || 0);
      const out = outstandingOf(i);
      v.outstanding += out;
      if (out > 0) {
        const age = ageDays(i.invoice_date);
        if (v.oldestUnpaidDays === null || age > v.oldestUnpaidDays) v.oldestUnpaidDays = age;
      }
    }
    const vendorRows = Array.from(byVendor.values()).sort((a, b) => b.invoiced - a.invoiced);

    // ── aging (as of today; ignores the date range on purpose) ──
    const openInvoices = vInvoices
      .filter((i) => OPEN_STATUSES.includes(i.status) && outstandingOf(i) > 0)
      .map((i) => ({ inv: i, outstanding: outstandingOf(i), age: ageDays(i.invoice_date) }));

    const agingByVendor = new Map<string, { name: string; buckets: number[]; total: number }>();
    for (const { inv, outstanding, age } of openInvoices) {
      let row = agingByVendor.get(inv.vendor_id);
      if (!row) {
        row = { name: inv.vendors?.company_name || "Unknown vendor", buckets: [0, 0, 0, 0], total: 0 };
        agingByVendor.set(inv.vendor_id, row);
      }
      row.buckets[bucketIndex(age)] += outstanding;
      row.total += outstanding;
    }
    const agingRowsAll = Array.from(agingByVendor.values()).sort((a, b) => b.total - a.total);
    const agingTop = agingRowsAll.slice(0, 9);
    const agingRest = agingRowsAll.slice(9);
    if (agingRest.length > 0) {
      const other = { name: `Other (${agingRest.length} vendors)`, buckets: [0, 0, 0, 0], total: 0 };
      for (const r of agingRest) {
        r.buckets.forEach((v, i) => (other.buckets[i] += v));
        other.total += r.total;
      }
      agingTop.push(other);
    }
    const agingTotals = [0, 1, 2, 3].map((b) => agingRowsAll.reduce((s, r) => s + r.buckets[b], 0));

    const overdueRows = openInvoices
      .map(({ inv, outstanding, age }) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        vendorName: inv.vendors?.company_name || "Unknown vendor",
        invoiceDate: inv.invoice_date,
        age,
        amount: Number(inv.invoice_amount),
        settled: Math.min(Number(inv.invoice_amount), settledByInvoice.get(inv.id) || 0),
        outstanding,
        status: inv.status,
      }))
      .sort((a, b) => b.age - a.age || b.outstanding - a.outstanding);

    // ── dumbbell: top vendors by invoiced in range ──
    const dumbbell = vendorRows.slice(0, 8).map((v) => ({
      name: v.name,
      invoiced: Math.round(v.invoiced),
      settled: Math.round(v.settled),
    }));

    // ── sparklines (last 12 months regardless of range, keeps tiles stable) ──
    const spark12 = monthKeys(new Date(today.getFullYear(), today.getMonth() - 11, 1), today);
    const sIdx = new Map(spark12.map((m, i) => [m.key, i]));
    const sparkInvoiced = new Array(12).fill(0);
    const sparkSettled = new Array(12).fill(0);
    for (const i of vInvoices) {
      if (i.status === "rejected") continue;
      const idx = sIdx.get(ym(i.invoice_date));
      if (idx !== undefined) sparkInvoiced[idx] += Number(i.invoice_amount);
    }
    for (const p of vPayments) {
      const idx = sIdx.get(ym(p.payment_date));
      if (idx !== undefined) sparkSettled[idx] += paymentSettled(p);
    }
    const sparkOutstanding: number[] = [];
    {
      const firstKey = spark12[0].key;
      let pre = 0;
      for (const i of vInvoices) if (i.status !== "rejected" && ym(i.invoice_date) < firstKey) pre += Number(i.invoice_amount);
      for (const p of vPayments) if (ym(p.payment_date) < firstKey) pre -= paymentSettled(p);
      let b = pre;
      for (let m = 0; m < 12; m++) {
        b += sparkInvoiced[m] - sparkSettled[m];
        sparkOutstanding.push(Math.max(0, b));
      }
    }

    // ═══════════════ DEEP ANALYSIS (range cohort unless stated) ═══════════════

    const daysBetween = (a: string, b: string) =>
      Math.max(0, Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY));

    // lifecycle funnel: submitted → approved → fully paid (count + ₹), with rejects aside
    const decided = rangeInvoices.filter((i) => ["approved", "partially_paid", "paid", "rejected"].includes(i.status));
    const approvedFamily = rangeInvoices.filter((i) => ["approved", "partially_paid", "paid"].includes(i.status));
    const fullyPaid = rangeInvoices.filter((i) => i.status === "paid");
    const sumAmt = (arr: InvoiceWithVendor[]) => arr.reduce((s, i) => s + Number(i.invoice_amount), 0);
    const funnel = {
      submitted: { count: rangeInvoices.length, amount: sumAmt(rangeInvoices) },
      approved: { count: approvedFamily.length, amount: sumAmt(approvedFamily) },
      paid: { count: fullyPaid.length, amount: sumAmt(fullyPaid) },
      inReview: rangeInvoices.filter((i) => ["submitted", "under_review"].includes(i.status)).length,
    };

    // process health KPIs
    const approveDaysAll: number[] = [];
    for (const i of approvedFamily) if (i.reviewed_at) approveDaysAll.push(daysBetween(i.invoice_date, i.reviewed_at.slice(0, 10)));
    const payDaysAll: number[] = [];
    for (const i of fullyPaid) {
      const last = lastPayByInvoice.get(i.id);
      if (last) payDaysAll.push(daysBetween(i.invoice_date, last));
    }
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const median = (xs: number[]) => {
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    };
    const withPo = rangeInvoices.filter((i) => i.po_number);
    const gstInRange = rangeInvoices.filter((i) => i.status !== "rejected").reduce((s, i) => s + Number(i.gst_amount || 0), 0);
    const tdsInRange = rangePayments.reduce((s, p) => s + Number(p.tds_amount || 0), 0);
    const processKpis = {
      approvalRatePct: decided.length ? Math.round((approvedFamily.length / decided.length) * 100) : null,
      rejectionRatePct: decided.length ? Math.round(((decided.length - approvedFamily.length) / decided.length) * 100) : null,
      avgApproveDays: avg(approveDaysAll),
      medianPayDays: median(payDaysAll),
      poCoveragePct: rangeInvoices.length ? Math.round((withPo.length / rangeInvoices.length) * 100) : null,
      gstInRange,
      tdsInRange,
    };

    // per-vendor deep metrics (density map + deep table)
    interface DeepVendorRow {
      vendorId: string; name: string; code: string;
      invoices: number; invoiced: number; avgSize: number;
      approvalPct: number | null; rejectionPct: number | null;
      avgApproveDays: number | null; avgPayDays: number | null;
      outstanding: number; tds: number; poPct: number;
    }
    const deepByVendor = new Map<string, {
      name: string; code: string; invoices: number; nonRejected: number; invoiced: number;
      decided: number; approvedF: number; appDays: number[]; payDays: number[];
      outstanding: number; tds: number; withPo: number;
    }>();
    for (const i of rangeInvoices) {
      let d = deepByVendor.get(i.vendor_id);
      if (!d) {
        d = { name: i.vendors?.company_name || "Unknown vendor", code: i.vendors?.vendor_code || "",
          invoices: 0, nonRejected: 0, invoiced: 0, decided: 0, approvedF: 0, appDays: [], payDays: [], outstanding: 0, tds: 0, withPo: 0 };
        deepByVendor.set(i.vendor_id, d);
      }
      d.invoices += 1;
      if (i.po_number) d.withPo += 1;
      if (i.status !== "rejected") {
        d.invoiced += Number(i.invoice_amount);
        d.nonRejected += 1;
      }
      if (["approved", "partially_paid", "paid", "rejected"].includes(i.status)) d.decided += 1;
      if (["approved", "partially_paid", "paid"].includes(i.status)) {
        d.approvedF += 1;
        if (i.reviewed_at) d.appDays.push(daysBetween(i.invoice_date, i.reviewed_at.slice(0, 10)));
      }
      if (i.status === "paid") {
        const last = lastPayByInvoice.get(i.id);
        if (last) d.payDays.push(daysBetween(i.invoice_date, last));
      }
      d.outstanding += outstandingOf(i);
    }
    for (const p of rangePayments) {
      const d = deepByVendor.get(p.vendor_id);
      if (d) d.tds += Number(p.tds_amount || 0);
    }
    const deepVendorRows: DeepVendorRow[] = Array.from(deepByVendor.entries())
      .map(([vendorId, d]) => ({
        vendorId, name: d.name, code: d.code,
        invoices: d.invoices, invoiced: Math.round(d.invoiced),
        avgSize: d.nonRejected ? Math.round(d.invoiced / d.nonRejected) : 0,
        approvalPct: d.decided ? Math.round((d.approvedF / d.decided) * 100) : null,
        rejectionPct: d.decided ? Math.round(((d.decided - d.approvedF) / d.decided) * 100) : null,
        avgApproveDays: avg(d.appDays),
        avgPayDays: avg(d.payDays),
        outstanding: Math.round(d.outstanding),
        tds: Math.round(d.tds),
        poPct: d.invoices ? Math.round((d.withPo / d.invoices) * 100) : 0,
      }))
      .sort((x, y) => y.invoiced - x.invoiced);

    // exposure vs pay-speed quadrant (vendors with at least one fully paid invoice)
    const quadrant = deepVendorRows
      .filter((v) => v.avgPayDays !== null && v.invoiced > 0)
      .map((v) => ({ name: v.name, invoiced: v.invoiced, payDays: v.avgPayDays!, outstanding: v.outstanding }));

    // payment-delay distribution (fully paid in range)
    const DELAY_BUCKETS = ["0–7", "8–15", "16–30", "31–45", "46–60", "61–90", "90+"];
    const delayIdx = (d: number) => (d <= 7 ? 0 : d <= 15 ? 1 : d <= 30 ? 2 : d <= 45 ? 3 : d <= 60 ? 4 : d <= 90 ? 5 : 6);
    const delayHistogram = DELAY_BUCKETS.map((label) => ({ label, count: 0, amount: 0 }));
    for (const i of fullyPaid) {
      const last = lastPayByInvoice.get(i.id);
      if (!last) continue;
      const b = delayIdx(daysBetween(i.invoice_date, last));
      delayHistogram[b].count += 1;
      delayHistogram[b].amount += Number(i.invoice_amount);
    }

    // weekly (or monthly, for long ranges) flow trend: submitted vs approved counts + ₹ settled
    const spanDays = axisFrom && axisTo ? Math.round((axisTo.getTime() - axisFrom.getTime()) / DAY) : 999;
    const weekly = spanDays <= 200;
    // all date math in LOCAL time — toISOString() shifts IST dates back a day
    const localIso = localDay;
    const bucketStart = (iso: string) => {
      const d = toDate(iso.slice(0, 10));
      if (weekly) {
        const day = (d.getDay() + 6) % 7; // Monday start
        d.setDate(d.getDate() - day);
      } else d.setDate(1);
      return localIso(d);
    };
    const flowKeys: string[] = [];
    {
      const cur = toDate(bucketStart(localIso(axisFrom!)));
      const end = axisTo || today;
      while (cur <= end) {
        flowKeys.push(localIso(cur));
        if (weekly) cur.setDate(cur.getDate() + 7);
        else cur.setMonth(cur.getMonth() + 1);
      }
    }
    const flowIdx = new Map(flowKeys.map((k, i) => [k, i]));
    const flowSubmitted = new Array(flowKeys.length).fill(0);
    const flowApproved = new Array(flowKeys.length).fill(0);
    const flowSettled = new Array(flowKeys.length).fill(0);
    for (const i of rangeInvoices) {
      const si = flowIdx.get(bucketStart(i.invoice_date));
      if (si !== undefined) flowSubmitted[si] += 1;
      if (i.reviewed_at && ["approved", "partially_paid", "paid"].includes(i.status)) {
        const ai = flowIdx.get(bucketStart(i.reviewed_at.slice(0, 10)));
        if (ai !== undefined) flowApproved[ai] += 1;
      }
    }
    for (const p of rangePayments) {
      const pi = flowIdx.get(bucketStart(p.payment_date));
      if (pi !== undefined) flowSettled[pi] += paymentSettled(p);
    }
    const flowLabels = flowKeys.map((k) =>
      toDate(k).toLocaleString("en-IN", weekly ? { day: "2-digit", month: "short" } : { month: "short", year: "2-digit" })
    );

    // approval-speed trend: avg days-to-approve per flow bucket (by review date)
    const approveTrendBuckets: number[][] = flowKeys.map(() => []);
    for (const i of approvedFamily) {
      if (!i.reviewed_at) continue;
      const bi = flowIdx.get(bucketStart(i.reviewed_at.slice(0, 10)));
      if (bi !== undefined) approveTrendBuckets[bi].push(daysBetween(i.invoice_date, i.reviewed_at.slice(0, 10)));
    }
    const approveTrend = approveTrendBuckets.map((xs) => avg(xs));

    // highest → lowest paid vendors (by ₹ actually settled to them, range cohort)
    const paidRanking = vendorRows
      .filter((v) => v.settled > 0)
      .map((v) => ({ name: v.name, settled: Math.round(v.settled) }))
      .sort((x, y) => y.settled - x.settled)
      .slice(0, 12);

    // rejection analysis
    const rejByReason = new Map<string, { count: number; amount: number }>();
    for (const i of rejected) {
      const key = (i.rejection_reason || "No reason recorded").trim();
      const r = rejByReason.get(key) || { count: 0, amount: 0 };
      r.count += 1;
      r.amount += Number(i.invoice_amount);
      rejByReason.set(key, r);
    }
    const rejectionRows = Array.from(rejByReason.entries())
      .map(([reason, r]) => ({ reason, ...r }))
      .sort((a, b) => b.amount - a.amount);

    // monthly rollup for the structured CSV
    const byMonthCsv = months.map((m, idx) => ({
      month: m.label,
      invoiced: invoicedByMonth[idx],
      settled: settledByMonth[idx],
      outstandingEnd: runningOutstanding[idx],
      payout: compPayout[idx],
      advance: compAdvance[idx],
      tds: compTds[idx],
    }));

    const registerRows = rangeInvoices
      .map((i) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        vendorName: i.vendors?.company_name || "Unknown vendor",
        invoiceDate: i.invoice_date,
        amount: Number(i.invoice_amount),
        gst: Number(i.gst_amount || 0),
        status: i.status,
        settled: Math.min(Number(i.invoice_amount), settledByInvoice.get(i.id) || 0),
        outstanding: outstandingOf(i),
      }))
      .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));

    return {
      months,
      invoicedByMonth: invoicedByMonth.map(Math.round),
      settledByMonth: settledByMonth.map(Math.round),
      runningOutstanding,
      kpis: {
        invoicedInRange, invoicedPrev,
        settledInRange, settledPrev,
        outstandingNow,
        outstandingPrevMonth: sparkOutstanding[10] ?? null,
        avgDaysToPay, paidCount: paidInRange.length,
      },
      sparkInvoiced, sparkSettled, sparkOutstanding,
      pipeline, rejectedCount: rejected.length, rejectedAmount,
      compPayout: compPayout.map(Math.round),
      compTds: compTds.map(Math.round),
      compAdvance: compAdvance.map(Math.round),
      vendorRows, dumbbell,
      agingRows: agingTop, agingTotals, overdueRows, registerRows,
      totalInvoiceCount: rangeInvoices.length,
      // deep analysis
      funnel, processKpis, deepVendorRows, quadrant, delayHistogram,
      flowLabels, flowSubmitted, flowApproved, flowSettled: flowSettled.map(Math.round),
      flowGranularity: (weekly ? "week" : "month") as "week" | "month",
      rejectionRows, byMonthCsv, approveTrend, paidRanking,
    };
  }, [invoices, payments, range, vendorFilter]);

  // vendor options for the filter (all vendors that ever invoiced)
  const vendorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of invoices) {
      if (!seen.has(i.vendor_id)) seen.set(i.vendor_id, i.vendors?.company_name || "Unknown vendor");
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);

  return { ...computed, vendorOptions, isLoading: invLoading || payLoading };
}
