import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  Users,
  FileCheck,
  Sparkles,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import type { PlatformDashboardData } from "@/hooks/usePlatformDashboard";

interface Props {
  totals: PlatformDashboardData["totals"];
}

export function PlatformSummaryStats({ totals }: Props) {
  const cards = [
    {
      title: "Organizations",
      value: totals.orgs,
      icon: Building2,
      color: "text-primary",
      sub: totals.inactiveOrgs > 0 ? `${totals.inactiveOrgs} disabled` : "all active",
    },
    {
      title: "Trial Orgs",
      value: totals.trialOrgs,
      icon: Sparkles,
      color: "text-[hsl(var(--warning))]",
      sub: "in free trial",
    },
    {
      title: "Paid Orgs",
      value: totals.paidOrgs,
      icon: CreditCard,
      color: "text-[hsl(var(--success))]",
      sub: "active or past due",
    },
    {
      title: "Total Users",
      value: totals.totalUsers,
      icon: Users,
      color: "text-info",
      sub: "staff + vendor logins",
    },
    {
      title: "Total Vendors",
      value: totals.totalVendors,
      icon: FileCheck,
      color: "text-accent",
      sub: `${totals.approvedVendors} approved`,
    },
    {
      title: "Approval Rate",
      value: `${totals.approvalRate}%`,
      icon: CheckCircle2,
      color:
        totals.approvalRate >= 80
          ? "text-[hsl(var(--success))]"
          : totals.approvalRate >= 50
          ? "text-[hsl(var(--warning))]"
          : "text-destructive",
      sub: "of all vendors",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title} className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">{card.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
