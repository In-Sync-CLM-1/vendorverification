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

const SERIES_REQUESTED = "#2a78d6";
const SERIES_APPROVED = "#1baf7a";

const STATUS_LABEL: Record<"pending" | "approved" | "rejected", string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
const STATUS_COLOR: Record<"pending" | "approved" | "rejected", string> = {
  pending: "#d97706",
  approved: "#1baf7a",
  rejected: "#dc2626",
};

const compactINR = (v: number) => {
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${v}`;
};

const fullINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

interface ChartAdvanceRequest {
  amount: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface AdvanceRequestChartsProps {
  requests: ChartAdvanceRequest[];
  months?: number;
}

export function AdvanceRequestCharts({ requests, months = 6 }: AdvanceRequestChartsProps) {
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; Requested: number; Approved: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
        Requested: 0,
        Approved: 0,
      });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const r of requests) {
      const key = (r.created_at || "").slice(0, 7);
      const b = byKey.get(key);
      if (!b) continue;
      b.Requested += Number(r.amount || 0);
      if (r.status === "approved") b.Approved += Number(r.amount || 0);
    }
    return buckets;
  }, [requests, months]);

  const statusData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of requests) {
      counts.set(r.status, (counts.get(r.status) || 0) + 1);
    }
    return (["pending", "approved", "rejected"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({ status: s, name: STATUS_LABEL[s], count: counts.get(s) || 0 }));
  }, [requests]);

  if (requests.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Requested vs Approved — last {months} months
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
              <Bar dataKey="Requested" fill={SERIES_REQUESTED} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Approved" fill={SERIES_APPROVED} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Requests by status</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={80} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="count" name="Requests" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {statusData.map((d) => (
                  <Cell key={d.status} fill={STATUS_COLOR[d.status]} />
                ))}
                <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
