import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Building2, MessageCircleX } from "lucide-react";
import type { OrgRow } from "@/hooks/usePlatformDashboard";

interface Props {
  recentOrgs: OrgRow[];
  failedWhatsapp24h: number;
  inactiveOrgs: number;
}

export function PlatformActivityFeed({ recentOrgs, failedWhatsapp24h, inactiveOrgs }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Recent signups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Recent Signups
          </CardTitle>
          <p className="text-xs text-muted-foreground">Last 10 organizations to register</p>
        </CardHeader>
        <CardContent>
          {recentOrgs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No signups yet</p>
          ) : (
            <div className="space-y-2">
              {recentOrgs.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-background/60"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{org.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {org.staff_count} staff · {org.vendor_count} vendors
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            Platform Health
          </CardTitle>
          <p className="text-xs text-muted-foreground">Things that might need attention</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-background/60">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <MessageCircleX className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Failed WhatsApp sends — last 24 h
                </p>
                <p className="text-2xl font-extrabold text-foreground mt-0.5">
                  {failedWhatsapp24h}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {failedWhatsapp24h === 0
                    ? "All sends successful"
                    : "Check whatsapp_messages.error_message for details"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-background/60">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Disabled organizations</p>
                <p className="text-2xl font-extrabold text-foreground mt-0.5">{inactiveOrgs}</p>
                <p className="text-[11px] text-muted-foreground">
                  {inactiveOrgs === 0
                    ? "No organizations are currently disabled"
                    : "These orgs cannot sign in until re-enabled"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
