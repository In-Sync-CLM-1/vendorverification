import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformDashboard } from "@/hooks/usePlatformDashboard";
import { PlatformSummaryStats } from "@/components/platform/PlatformSummaryStats";
import { PlatformOnboardingChart } from "@/components/platform/PlatformOnboardingChart";
import { PlatformSubscriptionDonut } from "@/components/platform/PlatformSubscriptionDonut";
import { PlatformOrgsTable } from "@/components/platform/PlatformOrgsTable";
import { PlatformActivityFeed } from "@/components/platform/PlatformActivityFeed";
import { RefreshCw } from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

function SectionSkeleton({ height = "h-48" }: { height?: string }) {
  return <Skeleton className={`w-full rounded-lg ${height}`} />;
}

export default function PlatformDashboard() {
  const { user } = useAuth();
  const { data, isLoading, refetch, isFetching } = usePlatformDashboard();

  const { data: ownTenantId } = useQuery({
    queryKey: ["platform-own-tenant", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.tenant_id ?? null;
    },
    enabled: !!user,
  });

  return (
    <StaffLayout title="Platform Command Center">
      <div className="p-4 md:p-6 space-y-5 w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Platform Command Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Across-org control, status and metrics
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Row 1 — Summary stats */}
        <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ delay: 0 }}>
          {isLoading || !data ? (
            <SectionSkeleton height="h-32" />
          ) : (
            <PlatformSummaryStats totals={data.totals} />
          )}
        </motion.div>

        {/* Row 2 — Chart + Donut */}
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="grid gap-4 lg:grid-cols-3"
        >
          <div className="lg:col-span-2">
            {isLoading || !data ? (
              <SectionSkeleton height="h-[380px]" />
            ) : (
              <PlatformOnboardingChart data={data.daily} />
            )}
          </div>
          <div>
            {isLoading || !data ? (
              <SectionSkeleton height="h-[380px]" />
            ) : (
              <PlatformSubscriptionDonut data={data.statusBreakdown} />
            )}
          </div>
        </motion.div>

        {/* Row 3 — Orgs table */}
        <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
          {isLoading || !data ? (
            <SectionSkeleton height="h-64" />
          ) : (
            <PlatformOrgsTable orgs={data.orgs} ownTenantId={ownTenantId ?? null} />
          )}
        </motion.div>

        {/* Row 4 — Activity & health */}
        <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
          {isLoading || !data ? (
            <SectionSkeleton height="h-64" />
          ) : (
            <PlatformActivityFeed
              recentOrgs={data.recentOrgs}
              failedWhatsapp24h={data.failedWhatsapp24h}
              inactiveOrgs={data.totals.inactiveOrgs}
            />
          )}
        </motion.div>
      </div>
    </StaffLayout>
  );
}
