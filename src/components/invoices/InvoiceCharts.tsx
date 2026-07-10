import { useMemo } from "react";
import {
  BarChart,
  Bar,
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

interface InvoiceChartsProps {
  invoices: ChartInvoice[];
  payments: ChartPayment[];
  months?: number;
}

export function InvoiceCharts({ invoices, payments, months = 6 }: InvoiceChartsProps) {
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; Invoiced: number; Paid: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
        Invoiced: 0,
        Paid: 0,
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
    return buckets;
  }, [invoices, payments, months]);

  const statusData = useMemo(() => {
    const counts = new Map<InvoiceStatus, number>();
    for (const inv of invoices) {
      counts.set(inv.status, (counts.get(inv.status) || 0) + 1);
    }
    return (Object.keys(INVOICE_STATUS_META) as InvoiceStatus[])
      .filter((s) => counts.has(s))
      .map((s) => ({ name: INVOICE_STATUS_META[s].label, count: counts.get(s) || 0 }));
  }, [invoices]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Invoiced vs Paid — last {months} months
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
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Invoices by status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">No invoices yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={94} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="count" name="Invoices" fill={SERIES_INVOICED} radius={[0, 4, 4, 0]} maxBarSize={18}>
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
