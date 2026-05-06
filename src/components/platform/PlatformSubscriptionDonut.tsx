import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import type { StatusBreakdown } from "@/hooks/usePlatformDashboard";

interface Props {
  data: StatusBreakdown[];
}

const STATUS_LABEL: Record<string, string> = {
  trial: "Trial",
  active: "Paid",
  past_due: "Past Due",
  cancelled: "Cancelled",
  expired: "Expired",
  no_subscription: "No subscription",
};

const STATUS_COLOR: Record<string, string> = {
  trial: "hsl(var(--warning))",
  active: "hsl(var(--success))",
  past_due: "hsl(var(--accent))",
  cancelled: "hsl(var(--muted-foreground))",
  expired: "hsl(var(--destructive))",
  no_subscription: "hsl(var(--muted))",
};

export function PlatformSubscriptionDonut({ data }: Props) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const chartData = data.map((d) => ({
    name: STATUS_LABEL[d.status] ?? d.status,
    value: d.count,
    color: STATUS_COLOR[d.status] ?? "hsl(var(--muted-foreground))",
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-bold">Subscription Mix</CardTitle>
        <p className="text-xs text-muted-foreground">{total} customer organization{total === 1 ? "" : "s"}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {total === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No subscriptions yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
