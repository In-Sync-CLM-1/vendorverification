import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useFraudAlerts, useDismissFraudAlert, useConfirmFraudAlert, FraudAlert, AlertFilter } from "@/hooks/useFraudAlerts";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FraudAlertCard } from "@/components/fraud/FraudAlertCard";
import { FraudAlertDetail } from "@/components/fraud/FraudAlertDetail";
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useUrlState } from "@/hooks/useUrlState";

export default function FraudAlertsDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRoles();
  const [activeTab, setActiveTab] = useUrlState<string>("tab", "pending");
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);

  const { alerts, stats, isLoading } = useFraudAlerts({
    status: activeTab === 'all' ? undefined : [activeTab as Database["public"]["Enums"]["fraud_alert_status"]],
  });

  const dismissMutation = useDismissFraudAlert();
  const confirmMutation = useConfirmFraudAlert();

  const handleDismiss = (alertId: string, reason: string) => {
    dismissMutation.mutate({ alertId, reason }, {
      onSuccess: () => {
        toast.success("Alert dismissed successfully");
        setSelectedAlert(null);
      },
      onError: () => toast.error("Failed to dismiss alert"),
    });
  };

  const handleConfirm = (alertId: string) => {
    confirmMutation.mutate(alertId, {
      onSuccess: () => {
        toast.success("Fraud confirmed - vendor flagged for review");
        setSelectedAlert(null);
      },
      onError: () => toast.error("Failed to confirm fraud"),
    });
  };

  const handleViewVendor = (vendorId: string) => {
    navigate(`/staff/vendor/${vendorId}`);
  };

  return (
    <StaffLayout title="Fraud Alerts">
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Fraud Detection</h1>
          <p className="text-sm text-muted-foreground">Monitor and review security alerts</p>
        </div>

        {/* Stats Cards */}
        <div className="p-4 grid grid-cols-4 gap-2 max-w-2xl">
          <Card className="border-destructive/30">
            <CardContent className="p-3 text-center">
              <ShieldAlert className="h-5 w-5 text-destructive mx-auto mb-1" />
              <p className="text-lg font-bold">{stats.critical}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </CardContent>
          </Card>
          <Card className="border-warning/30">
            <CardContent className="p-3 text-center">
              <AlertTriangle className="h-5 w-5 text-warning mx-auto mb-1" />
              <p className="text-lg font-bold">{stats.high}</p>
              <p className="text-xs text-muted-foreground">High</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Clock className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-success mx-auto mb-1" />
              <p className="text-lg font-bold">{stats.dismissed}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-4 max-w-md">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
              <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Alerts List */}
        <div className="p-4 space-y-3 max-w-2xl">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Loading alerts...</p>
              </CardContent>
            </Card>
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
                <p className="font-medium">No alerts found</p>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'pending' ? "All caught up! No pending alerts." : "No alerts in this category."}
                </p>
              </CardContent>
            </Card>
          ) : (
            alerts.map((alert) => (
              <FraudAlertCard
                key={alert.id}
                alert={alert}
                onClick={() => setSelectedAlert(alert)}
              />
            ))
          )}
        </div>
      </div>

      {/* Alert Detail Dialog */}
      {selectedAlert && (
        <FraudAlertDetail
          alert={selectedAlert}
          open={!!selectedAlert}
          onOpenChange={(open) => !open && setSelectedAlert(null)}
          onDismiss={handleDismiss}
          onConfirm={handleConfirm}
          onViewVendor={handleViewVendor}
        />
      )}
    </StaffLayout>
  );
}
