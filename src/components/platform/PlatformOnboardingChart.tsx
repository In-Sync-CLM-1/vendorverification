import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyPoint } from "@/hooks/usePlatformDashboard";

interface Props {
  data: DailyPoint[];
}

export function PlatformOnboardingChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "dd MMM"),
    Orgs: d.orgs,
    Vendors: d.vendors,
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-bold">Onboarding — Last 30 Days</CardTitle>
        <p className="text-xs text-muted-foreground">New organizations and vendors per day</p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="Orgs"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Vendors"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
