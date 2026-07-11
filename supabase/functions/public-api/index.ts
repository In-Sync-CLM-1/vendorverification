import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public API for enterprise customers — auth via API key (Bearer isk_live_...)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function jsonOk(data: object, requestId: string) {
  return new Response(JSON.stringify({ success: true, ...data, request_id: requestId }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(code: string, message: string, status = 400, requestId?: string) {
  return new Response(
    JSON.stringify({ success: false, error: code, message, request_id: requestId ?? crypto.randomUUID() }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate via API key
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer isk_live_")) {
      return jsonErr("unauthorized", "Valid API key required (Bearer isk_live_...)", 401, requestId);
    }

    const apiKey = authHeader.replace("Bearer ", "").trim();
    const keyHash = await sha256Hex(apiKey);

    const { data: keyRecord } = await supabase
      .from("api_keys")
      .select("id, tenant_id, is_active")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (!keyRecord) {
      return jsonErr("unauthorized", "Invalid or inactive API key", 401, requestId);
    }

    const tenantId: string = keyRecord.tenant_id;

    // Update last_used_at fire-and-forget
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRecord.id)
      .then(() => {});

    // Resolve action and org-slug from headers (set by the Cloudflare worker that
    // routes /api/<org-slug>/<action>). Fall back to request body for direct/legacy
    // callers hitting the function URL with {action: "..."} in JSON.
    const headerOrgSlug = req.headers.get("X-Org-Slug");
    const headerAction = req.headers.get("X-Action");
    const body = await req.json().catch(() => ({}));
    const action = headerAction || body.action;

    if (!action) {
      return jsonErr("missing_action", "action is required (path /api/<org>/<action> or body.action)", 400, requestId);
    }

    // If the request came via the worker, sanity-check that the URL's org-slug
    // matches the tenant the API key belongs to. Prevents one tenant's key from
    // being used at another tenant's URL.
    if (headerOrgSlug) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .maybeSingle();
      if (!tenant || tenant.slug !== headerOrgSlug) {
        return jsonErr(
          "org_mismatch",
          "API key does not belong to the organization in the URL",
          403,
          requestId
        );
      }
    }

    // ── list_approved_vendors ───────────────────────────────────────
    // Read-only listing of this tenant's already-approved vendors — no
    // verification is performed, so it doesn't draw from the quota below.
    if (action === "list_approved_vendors") {
      const { data: vendors, error: listErr } = await supabase
        .from("vendors")
        .select("vendor_code, company_name, trade_name, approved_at, primary_contact_name, primary_mobile, primary_email, vendor_categories(name)")
        .eq("tenant_id", tenantId)
        .eq("current_status", "approved")
        .order("approved_at", { ascending: false });

      if (listErr) {
        return jsonErr("query_failed", listErr.message, 500, requestId);
      }

      const data = (vendors || []).map((v: any) => ({
        vendor_code: v.vendor_code,
        company_name: v.company_name,
        trade_name: v.trade_name,
        category: v.vendor_categories?.name ?? null,
        contact_name: v.primary_contact_name,
        contact_mobile: v.primary_mobile,
        contact_email: v.primary_email,
        approved_at: v.approved_at,
      }));

      return jsonOk({ data }, requestId);
    }

    // ── list_invoices ────────────────────────────────────────────────
    // Read-only listing of this tenant's vendor invoices (every status) with
    // their recorded payments — no verification is performed, so no quota draw.
    if (action === "list_invoices") {
      const { data: invoices, error: listErr } = await supabase
        .from("vendor_invoices")
        .select(
          "invoice_number, invoice_date, invoice_amount, gst_amount, description, po_number, status, rejection_reason, reviewed_at, created_at, vendors(company_name, trade_name, vendor_code), vendor_invoice_payments(payment_date, advance_adjusted, gst_amount, tds_amount, payout_amount, total_settled, utr_reference, remarks, is_full_settlement)"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (listErr) {
        return jsonErr("query_failed", listErr.message, 500, requestId);
      }

      const data = (invoices || []).map((inv: any) => ({
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        invoice_amount: inv.invoice_amount,
        gst_amount: inv.gst_amount,
        description: inv.description,
        po_number: inv.po_number,
        status: inv.status,
        rejection_reason: inv.rejection_reason,
        reviewed_at: inv.reviewed_at,
        created_at: inv.created_at,
        vendor_company_name: inv.vendors?.company_name ?? null,
        vendor_trade_name: inv.vendors?.trade_name ?? null,
        vendor_code: inv.vendors?.vendor_code ?? null,
        payments: (inv.vendor_invoice_payments || []).map((p: any) => ({
          payment_date: p.payment_date,
          advance_adjusted: p.advance_adjusted,
          gst_amount: p.gst_amount,
          tds_amount: p.tds_amount,
          payout_amount: p.payout_amount,
          total_settled: p.total_settled,
          utr_reference: p.utr_reference,
          remarks: p.remarks,
          is_full_settlement: p.is_full_settlement,
        })),
      }));

      return jsonOk({ data }, requestId);
    }

    // ── get_invoice_analytics ───────────────────────────────────────────
    // Same computation as the staff Invoice Analytics dashboard
    // (src/hooks/useInvoiceAnalytics.tsx), run server-side for a caller-supplied
    // date range + vendor filter — read-only, no quota draw.
    if (action === "get_invoice_analytics") {
      const rangeFrom: string | null = body.from ?? null; // "YYYY-MM-DD" or null = all time
      const rangeTo: string | null = body.to ?? null;
      const vendorFilter: string = body.vendor_id || "all";

      const { data: invoicesRaw, error: invErr } = await supabase
        .from("vendor_invoices")
        .select(
          "id, vendor_id, invoice_number, invoice_date, invoice_amount, gst_amount, po_number, status, rejection_reason, reviewed_at, created_at, vendors(company_name, vendor_code)"
        )
        .eq("tenant_id", tenantId)
        .order("invoice_date", { ascending: true });
      if (invErr) return jsonErr("query_failed", invErr.message, 500, requestId);

      const { data: paymentsRaw, error: payErr } = await supabase
        .from("vendor_invoice_payments")
        .select(
          "invoice_id, vendor_id, payment_date, advance_adjusted, gst_amount, tds_amount, payout_amount, utr_reference, remarks, is_full_settlement"
        )
        .eq("tenant_id", tenantId)
        .order("payment_date", { ascending: true });
      if (payErr) return jsonErr("query_failed", payErr.message, 500, requestId);

      type Inv = {
        id: string; vendor_id: string; invoice_number: string; invoice_date: string;
        invoice_amount: number; gst_amount: number; po_number: string | null;
        status: string; rejection_reason: string | null; reviewed_at: string | null; created_at: string;
        vendors: { company_name: string; vendor_code: string | null } | null;
      };
      type Pay = {
        invoice_id: string; vendor_id: string; payment_date: string;
        advance_adjusted: number; gst_amount: number; tds_amount: number; payout_amount: number;
      };

      const invoices = (invoicesRaw || []) as unknown as Inv[];
      const payments = (paymentsRaw || []) as unknown as Pay[];

      const DAY = 24 * 60 * 60 * 1000;
      const ym = (iso: string | null | undefined) => (iso || "").slice(0, 7);
      const toDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
      const ageDays = (iso: string) => Math.floor((Date.now() - toDate(iso).getTime()) / DAY);
      const paymentSettled = (p: Pay) =>
        Number(p.advance_adjusted || 0) + Number(p.tds_amount || 0) + Number(p.payout_amount || 0);

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

      const AGING_BUCKETS = [
        { label: "0–30 days", min: 0, max: 30 },
        { label: "31–60 days", min: 31, max: 60 },
        { label: "61–90 days", min: 61, max: 90 },
        { label: "90+ days", min: 91, max: null as number | null },
      ];
      const bucketIndex = (days: number) => (days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3);
      const OPEN_STATUSES = ["submitted", "under_review", "approved", "partially_paid"];

      // ── vendor scope (applies to everything) ──
      const vInvoices = vendorFilter === "all" ? invoices : invoices.filter((i) => i.vendor_id === vendorFilter);
      const vPayments = vendorFilter === "all" ? payments : payments.filter((p) => p.vendor_id === vendorFilter);

      const settledByInvoice = new Map<string, number>();
      const lastPayByInvoice = new Map<string, string>();
      for (const p of vPayments) {
        settledByInvoice.set(p.invoice_id, (settledByInvoice.get(p.invoice_id) || 0) + paymentSettled(p));
        const prev = lastPayByInvoice.get(p.invoice_id);
        if (!prev || p.payment_date > prev) lastPayByInvoice.set(p.invoice_id, p.payment_date);
      }
      const outstandingOf = (inv: Inv) =>
        inv.status === "paid" || inv.status === "rejected"
          ? 0
          : Math.max(0, Number(inv.invoice_amount) - (settledByInvoice.get(inv.id) || 0));

      const localDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const rangeFromDate = rangeFrom ? toDate(rangeFrom) : null;
      const rangeToDate = rangeTo ? toDate(rangeTo) : null;
      const fromIso = rangeFromDate ? localDay(rangeFromDate) : "0000";
      const toIso = rangeToDate ? localDay(rangeToDate) : "9999";
      const inRange = (iso: string | null | undefined) => !!iso && iso >= fromIso && iso <= toIso;

      const rangeInvoices = vInvoices.filter((i) => inRange(i.invoice_date));
      const rangePayments = vPayments.filter((p) => inRange(p.payment_date));

      const today = new Date();
      let axisFrom = rangeFromDate;
      const axisTo = rangeToDate || today;
      if (!axisFrom) {
        const first = vInvoices[0]?.invoice_date || vPayments[0]?.payment_date;
        axisFrom = first ? toDate(first) : new Date(today.getFullYear(), today.getMonth() - 5, 1);
      }
      const months = monthKeys(axisFrom, axisTo);
      const monthIdx = new Map(months.map((m, i) => [m.key, i]));

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

      const invoicedInRange = rangeInvoices.filter((i) => i.status !== "rejected").reduce((s, i) => s + Number(i.invoice_amount), 0);
      const settledInRange = rangePayments.reduce((s, p) => s + paymentSettled(p), 0);
      const outstandingNow = vInvoices.reduce((s, i) => s + outstandingOf(i), 0);

      let invoicedPrev: number | null = null, settledPrev: number | null = null;
      if (rangeFromDate && rangeToDate) {
        const len = rangeToDate.getTime() - rangeFromDate.getTime() + DAY;
        const pFrom = new Date(rangeFromDate.getTime() - len).toISOString().slice(0, 10);
        const pTo = new Date(rangeFromDate.getTime() - DAY).toISOString().slice(0, 10);
        invoicedPrev = vInvoices
          .filter((i) => i.status !== "rejected" && i.invoice_date >= pFrom && i.invoice_date <= pTo)
          .reduce((s, i) => s + Number(i.invoice_amount), 0);
        settledPrev = vPayments
          .filter((p) => p.payment_date >= pFrom && p.payment_date <= pTo)
          .reduce((s, p) => s + paymentSettled(p), 0);
      }

      const paidInRange = vInvoices.filter((i) => i.status === "paid" && inRange(lastPayByInvoice.get(i.id)));
      const daysToPay = paidInRange.map((i) => {
        const last = lastPayByInvoice.get(i.id)!;
        return Math.max(0, Math.round((toDate(last).getTime() - toDate(i.invoice_date).getTime()) / DAY));
      });
      const avgDaysToPay = daysToPay.length ? Math.round(daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length) : null;

      const pipelineOrder = ["submitted", "under_review", "approved", "partially_paid", "paid"];
      const pipeline = pipelineOrder.map((s) => ({
        status: s,
        amount: rangeInvoices.filter((i) => i.status === s).reduce((sum, i) => sum + Number(i.invoice_amount), 0),
        count: rangeInvoices.filter((i) => i.status === s).length,
      }));
      const rejected = rangeInvoices.filter((i) => i.status === "rejected");
      const rejectedAmount = rejected.reduce((s, i) => s + Number(i.invoice_amount), 0);

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

      interface VendorAgg {
        vendorId: string; name: string; code: string; count: number;
        invoiced: number; settled: number; outstanding: number; oldestUnpaidDays: number | null;
      }
      const byVendor = new Map<string, VendorAgg>();
      for (const i of rangeInvoices) {
        if (i.status === "rejected") continue;
        let v = byVendor.get(i.vendor_id);
        if (!v) {
          v = { vendorId: i.vendor_id, name: i.vendors?.company_name || "Unknown vendor", code: i.vendors?.vendor_code || "",
            count: 0, invoiced: 0, settled: 0, outstanding: 0, oldestUnpaidDays: null };
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
          id: inv.id, invoiceNumber: inv.invoice_number, vendorName: inv.vendors?.company_name || "Unknown vendor",
          invoiceDate: inv.invoice_date, age, amount: Number(inv.invoice_amount),
          settled: Math.min(Number(inv.invoice_amount), settledByInvoice.get(inv.id) || 0),
          outstanding, status: inv.status,
        }))
        .sort((a, b) => b.age - a.age || b.outstanding - a.outstanding);

      const dumbbell = vendorRows.slice(0, 8).map((v) => ({
        name: v.name, invoiced: Math.round(v.invoiced), settled: Math.round(v.settled),
      }));

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
      const daysBetween = (a: string, b: string) => Math.max(0, Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY));

      const decided = rangeInvoices.filter((i) => ["approved", "partially_paid", "paid", "rejected"].includes(i.status));
      const approvedFamily = rangeInvoices.filter((i) => ["approved", "partially_paid", "paid"].includes(i.status));
      const fullyPaid = rangeInvoices.filter((i) => i.status === "paid");
      const sumAmt = (arr: Inv[]) => arr.reduce((s, i) => s + Number(i.invoice_amount), 0);
      const funnel = {
        submitted: { count: rangeInvoices.length, amount: sumAmt(rangeInvoices) },
        approved: { count: approvedFamily.length, amount: sumAmt(approvedFamily) },
        paid: { count: fullyPaid.length, amount: sumAmt(fullyPaid) },
        inReview: rangeInvoices.filter((i) => ["submitted", "under_review"].includes(i.status)).length,
      };

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
        gstInRange, tdsInRange,
      };

      interface DeepVendorRow {
        vendorId: string; name: string; code: string; invoices: number; invoiced: number; avgSize: number;
        approvalPct: number | null; rejectionPct: number | null; avgApproveDays: number | null; avgPayDays: number | null;
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
          vendorId, name: d.name, code: d.code, invoices: d.invoices, invoiced: Math.round(d.invoiced),
          avgSize: d.nonRejected ? Math.round(d.invoiced / d.nonRejected) : 0,
          approvalPct: d.decided ? Math.round((d.approvedF / d.decided) * 100) : null,
          rejectionPct: d.decided ? Math.round(((d.decided - d.approvedF) / d.decided) * 100) : null,
          avgApproveDays: avg(d.appDays), avgPayDays: avg(d.payDays),
          outstanding: Math.round(d.outstanding), tds: Math.round(d.tds),
          poPct: d.invoices ? Math.round((d.withPo / d.invoices) * 100) : 0,
        }))
        .sort((x, y) => y.invoiced - x.invoiced);

      const quadrant = deepVendorRows
        .filter((v) => v.avgPayDays !== null && v.invoiced > 0)
        .map((v) => ({ name: v.name, invoiced: v.invoiced, payDays: v.avgPayDays!, outstanding: v.outstanding }));

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

      const spanDays = axisFrom && axisTo ? Math.round((axisTo.getTime() - axisFrom.getTime()) / DAY) : 999;
      const weekly = spanDays <= 200;
      const localIso = localDay;
      const bucketStart = (iso: string) => {
        const d = toDate(iso.slice(0, 10));
        if (weekly) {
          const day = (d.getDay() + 6) % 7;
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

      const approveTrendBuckets: number[][] = flowKeys.map(() => []);
      for (const i of approvedFamily) {
        if (!i.reviewed_at) continue;
        const bi = flowIdx.get(bucketStart(i.reviewed_at.slice(0, 10)));
        if (bi !== undefined) approveTrendBuckets[bi].push(daysBetween(i.invoice_date, i.reviewed_at.slice(0, 10)));
      }
      const approveTrend = approveTrendBuckets.map((xs) => avg(xs));

      const paidRanking = vendorRows
        .filter((v) => v.settled > 0)
        .map((v) => ({ name: v.name, settled: Math.round(v.settled) }))
        .sort((x, y) => y.settled - x.settled)
        .slice(0, 12);

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

      const byMonthCsv = months.map((m, idx) => ({
        month: m.label, invoiced: invoicedByMonth[idx], settled: settledByMonth[idx],
        outstandingEnd: runningOutstanding[idx], payout: compPayout[idx], advance: compAdvance[idx], tds: compTds[idx],
      }));

      const registerRows = rangeInvoices
        .map((i) => ({
          id: i.id, invoiceNumber: i.invoice_number, vendorName: i.vendors?.company_name || "Unknown vendor",
          invoiceDate: i.invoice_date, amount: Number(i.invoice_amount), gst: Number(i.gst_amount || 0),
          status: i.status, settled: Math.min(Number(i.invoice_amount), settledByInvoice.get(i.id) || 0),
          outstanding: outstandingOf(i),
        }))
        .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));

      const vendorOptionsMap = new Map<string, string>();
      for (const i of invoices) if (!vendorOptionsMap.has(i.vendor_id)) vendorOptionsMap.set(i.vendor_id, i.vendors?.company_name || "Unknown vendor");
      const vendorOptions = Array.from(vendorOptionsMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const analytics = {
        months, invoicedByMonth: invoicedByMonth.map(Math.round), settledByMonth: settledByMonth.map(Math.round),
        runningOutstanding,
        kpis: {
          invoicedInRange, invoicedPrev, settledInRange, settledPrev, outstandingNow,
          outstandingPrevMonth: sparkOutstanding[10] ?? null, avgDaysToPay, paidCount: paidInRange.length,
        },
        sparkInvoiced, sparkSettled, sparkOutstanding,
        pipeline, rejectedCount: rejected.length, rejectedAmount,
        compPayout: compPayout.map(Math.round), compTds: compTds.map(Math.round), compAdvance: compAdvance.map(Math.round),
        vendorRows, dumbbell,
        agingRows: agingTop, agingTotals, overdueRows, registerRows,
        totalInvoiceCount: rangeInvoices.length,
        funnel, processKpis, deepVendorRows, quadrant, delayHistogram,
        flowLabels, flowSubmitted, flowApproved, flowSettled: flowSettled.map(Math.round),
        flowGranularity: weekly ? "week" : "month",
        rejectionRows, byMonthCsv, approveTrend, paidRanking,
        vendorOptions, agingBuckets: AGING_BUCKETS,
      };

      return jsonOk({ data: analytics }, requestId);
    }

    // Deduct from quota for all actions
    const { data: usageResult } = await supabase.rpc("increment_vendor_usage", {
      _tenant_id: tenantId,
    });
    if (usageResult === -2) {
      return jsonErr(
        "quota_exceeded",
        "Verification limit reached. Please upgrade your plan.",
        429,
        requestId
      );
    }

    // ── verify_gst ───────────────────────────────────────────────────
    if (action === "verify_gst") {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-gst`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gstin: body.gstin, vendor_id: body.vendor_id ?? null }),
      });
      const data = await res.json();
      return jsonOk({ data }, requestId);
    }

    // ── verify_pan ───────────────────────────────────────────────────
    if (action === "verify_pan") {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-pan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pan_number: body.pan_number, vendor_id: body.vendor_id ?? null }),
      });
      const data = await res.json();
      return jsonOk({ data }, requestId);
    }

    // ── verify_bank_account ──────────────────────────────────────────
    if (action === "verify_bank_account") {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-bank-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_number: body.account_number,
          ifsc_code: body.ifsc_code,
          vendor_id: body.vendor_id ?? null,
        }),
      });
      const data = await res.json();
      return jsonOk({ data }, requestId);
    }

    // ── get_vendor ───────────────────────────────────────────────────
    if (action === "get_vendor") {
      if (!body.vendor_id) {
        return jsonErr("missing_param", "vendor_id is required", 400, requestId);
      }

      const { data: vendor } = await supabase
        .from("vendors")
        .select("id, company_name, current_status, submitted_at, approved_at, rejected_at, rejection_reason")
        .eq("id", body.vendor_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!vendor) {
        return jsonErr("not_found", "Vendor not found", 404, requestId);
      }

      const { data: verifications } = await supabase
        .from("vendor_verifications")
        .select("verification_type, status, verified_at")
        .eq("vendor_id", body.vendor_id)
        .order("verified_at", { ascending: false });

      return jsonOk({ data: { vendor, verifications: verifications || [] } }, requestId);
    }

    // ── submit_vendor ────────────────────────────────────────────────
    if (action === "submit_vendor") {
      const {
        company_name, primary_contact_name, primary_mobile, primary_email,
        trade_name, gst_number, pan_number,
        bank_name, bank_branch, bank_account_number, bank_ifsc,
      } = body;

      if (!company_name || !primary_contact_name || !primary_mobile || !primary_email) {
        return jsonErr(
          "missing_fields",
          "company_name, primary_contact_name, primary_mobile, primary_email are required",
          400,
          requestId
        );
      }

      const { data: vendor, error: insertErr } = await supabase
        .from("vendors")
        .insert({
          company_name: String(company_name).trim().substring(0, 255),
          trade_name: trade_name ? String(trade_name).trim().substring(0, 255) : null,
          gst_number: gst_number ? String(gst_number).toUpperCase() : null,
          pan_number: pan_number ? String(pan_number).toUpperCase() : null,
          primary_contact_name: String(primary_contact_name).trim().substring(0, 255),
          primary_mobile: String(primary_mobile).trim(),
          primary_email: String(primary_email).trim(),
          bank_name: bank_name ? String(bank_name).trim() : null,
          bank_branch: bank_branch ? String(bank_branch).trim() : null,
          bank_account_number: bank_account_number ? String(bank_account_number).trim() : null,
          bank_ifsc: bank_ifsc ? String(bank_ifsc).toUpperCase() : null,
          tenant_id: tenantId,
          current_status: "pending_review",
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr) {
        return jsonErr("insert_failed", insertErr.message, 500, requestId);
      }

      return jsonOk({ data: { vendor_id: vendor.id } }, requestId);
    }

    return jsonErr("unknown_action", `Unknown action: ${action}`, 400, requestId);
  } catch (err) {
    console.error("Public API error:", err);
    return jsonErr("internal_error", "Request failed", 500, requestId);
  }
});
