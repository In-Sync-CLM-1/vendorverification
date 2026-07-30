import { useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { INVOICE_STATUS_META, InvoiceStatus, paymentSettled } from "@/lib/invoices";

const SERIES_INVOICED = "#2a78d6";
const SERIES_PAID = "#1baf7a";
const SERIES_ADVANCE = "#d97706";

const ADVANCE_STATUS_LABEL: Record<"pending" | "approved" | "rejected", string> = {
  pending: "Advance: Pending",
  approved: "Advance: Approved",
  rejected: "Advance: Rejected",
};

const compactINR = (v: number) => {
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${v}`;
};

const fullINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

interface ChartInvoice {
  invoice_amount: number;
  invoice_date: string;
  status: InvoiceStatus;
}

interface ChartPayment {
  payment_date: string;
  advance_adjusted: number;
  tds_amount: number;
  payout_amount: number;
}

interface ChartAdvanceRequest {
  amount: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface InvoiceChartsProps {
  invoices: ChartInvoice[];
  payments: ChartPayment[];
  advanceRequests?: ChartAdvanceRequest[];
  months?: number;
}

export function InvoiceCharts({ invoices, payments, advanceRequests = [], months = 6 }: InvoiceChartsProps) {
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; Invoiced: number; Paid: number; "Advance Requested": number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
        Invoiced: 0,
        Paid: 0,
        "Advance Requested": 0,
      });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const inv of invoices) {
      const key = (inv.invoice_date || "").slice(0, 7);
      const b = byKey.get(key);
      if (b) b.Invoiced += Number(inv.invoice_amount || 0);
    }
    for (const p of payments) {
      const key = (p.payment_date || "").slice(0, 7);
      const b = byKey.get(key);
      if (b) b.Paid += paymentSettled(p);
    }
    for (const r of advanceRequests) {
      const key = (r.created_at || "").slice(0, 7);
      const b = byKey.get(key);
      if (b) b["Advance Requested"] += Number(r.amount || 0);
    }
    return buckets;
  }, [invoices, payments, advanceRequests, months]);

  const statusData = useMemo(() => {
    const counts = new Map<InvoiceStatus, number>();
    for (const inv of invoices) {
      counts.set(inv.status, (counts.get(inv.status) || 0) + 1);
    }
    const rows = (Object.keys(INVOICE_STATUS_META) as InvoiceStatus[])
      .filter((s) => counts.has(s))
      .map((s) => ({ name: INVOICE_STATUS_META[s].label, count: counts.get(s) || 0, kind: "invoice" as const }));

    const advanceCounts = new Map<"pending" | "approved" | "rejected", number>();
    for (const r of advanceRequests) {
      advanceCounts.set(r.status, (advanceCounts.get(r.status) || 0) + 1);
    }
    const advanceRows = (["pending", "approved", "rejected"] as const)
      .filter((s) => advanceCounts.has(s))
      .map((s) => ({ name: ADVANCE_STATUS_LABEL[s], count: advanceCounts.get(s) || 0, kind: "advance" as const }));

    return [...rows, ...advanceRows];
  }, [invoices, advanceRequests]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Invoiced, Paid &amp; Advances — last {months} months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={compactINR} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={52} />
              <Tooltip formatter={(v: number) => fullINR(v)} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Invoiced" fill={SERIES_INVOICED} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Paid" fill={SERIES_PAID} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Advance Requested" fill={SERIES_ADVANCE} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Invoices &amp; Advances by status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">No invoices or advance requests yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={110} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {statusData.map((d) => (
                    <Cell key={d.name} fill={d.kind === "advance" ? SERIES_ADVANCE : SERIES_INVOICED} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
