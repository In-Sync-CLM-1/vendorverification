import { assertRowsChanged } from "@/lib/writeGuard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Tables, Database } from "@/integrations/supabase/types";

export interface FraudAlertDetails {
  matching_vendor_id?: string;
  matching_vendor_name?: string;
  matching_value?: string;
  similarity_score?: number;
  tampering_indicators?: string[];
  confidence_score?: number;
  verification_type?: string;
  verification_error?: string;
}

export type FraudAlert = Omit<Tables<"fraud_alerts">, "details"> & {
  vendor_name: string;
  vendor_code: string | null;
  details: FraudAlertDetails;
};

type FraudAlertStatus = Database["public"]["Enums"]["fraud_alert_status"];

export type AlertFilter = {
  severity?: FraudAlert['severity'][];
  type?: FraudAlert['alert_type'][];
  status?: FraudAlert['status'][];
};

type AlertRow = Tables<"fraud_alerts"> & {
  vendors: { company_name: string; vendor_code: string | null };
};

function toFraudAlert(row: AlertRow): FraudAlert {
  const { vendors, details, ...rest } = row;
  return {
    ...rest,
    details: (details ?? {}) as FraudAlertDetails,
    vendor_name: vendors?.company_name ?? "Unknown",
    vendor_code: vendors?.vendor_code ?? null,
  };
}

export function useFraudAlerts(filters?: AlertFilter) {
  const { user } = useAuth();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["fraud-alerts", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("fraud_alerts")
        .select(`
          *,
          vendors!inner (company_name, vendor_code)
        `)
        .order("created_at", { ascending: false });

      if (filters?.severity?.length) {
        query = query.in("severity", filters.severity);
      }
      if (filters?.type?.length) {
        query = query.in("alert_type", filters.type);
      }
      if (filters?.status?.length) {
        query = query.in("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row) => toFraudAlert(row as unknown as AlertRow));
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const stats = {
    critical: alerts.filter(a => a.severity === 'critical' && a.status === 'pending').length,
    high: alerts.filter(a => a.severity === 'high' && a.status === 'pending').length,
    pending: alerts.filter(a => a.status === 'pending').length,
    dismissed: alerts.filter(a => a.status === 'dismissed').length,
    total: alerts.length,
  };

  return { alerts, stats, isLoading };
}

export function useFraudAlertById(alertId: string | null) {
  const { user } = useAuth();

  const { data: alert = null, isLoading } = useQuery({
    queryKey: ["fraud-alert", alertId],
    queryFn: async () => {
      if (!alertId) return null;
      const { data, error } = await supabase
        .from("fraud_alerts")
        .select(`
          *,
          vendors!inner (company_name, vendor_code)
        `)
        .eq("id", alertId)
        .single();

      if (error) throw error;
      return toFraudAlert(data as unknown as AlertRow);
    },
    enabled: !!user && !!alertId,
  });

  return { alert, isLoading };
}

export function useVendorFraudAlerts(vendorId: string | null) {
  const { user } = useAuth();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["vendor-fraud-alerts", vendorId],
    queryFn: async () => {
      if (!vendorId) return [];
      const { data, error } = await supabase
        .from("fraud_alerts")
        .select(`
          *,
          vendors!inner (company_name, vendor_code)
        `)
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((row) => toFraudAlert(row as unknown as AlertRow));
    },
    enabled: !!user && !!vendorId,
  });

  return { alerts, isLoading };
}

export function useDismissFraudAlert() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, reason }: { alertId: string; reason: string }) => {
      const { data, error } = await supabase
        .from("fraud_alerts")
        .update({
          status: "dismissed" as FraudAlertStatus,
          dismiss_reason: reason,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .select("id");
      if (error) throw error;
      assertRowsChanged(data, "The alert review");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["fraud-alert"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-fraud-alerts"] });
    },
  });
}

export function useConfirmFraudAlert() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase
        .from("fraud_alerts")
        .update({
          status: "confirmed" as FraudAlertStatus,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .select("id");
      if (error) throw error;
      assertRowsChanged(data, "The alert review");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["fraud-alert"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-fraud-alerts"] });
    },
  });
}
