import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "maker" | "approver" | "admin" | "platform_admin";

export function useUserRoles() {
  const { user, userType } = useAuth();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["user-roles", user?.id],
    queryFn: async () => {
      if (!user || userType !== "staff") return [];

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) throw error;
      return data.map((r) => r.role as AppRole);
    },
    enabled: !!user && userType === "staff",
  });

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin") || hasRole("platform_admin");
  const isPlatformAdmin = hasRole("platform_admin");
  const isMaker = hasRole("maker");
  const isApprover = hasRole("approver");

  return {
    roles,
    isLoading,
    hasRole,
    isAdmin,
    isPlatformAdmin,
    isMaker,
    isApprover,
  };
}
