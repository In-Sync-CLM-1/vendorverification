import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "maker" | "approver" | "admin" | "platform_admin" | "accounts" | "viewer" | "livecom_uploader";

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
  const isAccounts = hasRole("accounts") || isAdmin;
  // A pure viewer: has the viewer role and nothing that would let them act
  // (mirrors the DB's is_view_only — someone who is a viewer AND something
  // else keeps whatever that other role grants).
  const isViewOnly = hasRole("viewer") && !isMaker && !isApprover && !isAccounts && !isAdmin;
  // Separate from isViewOnly on purpose: a Livecom account can upload an
  // invoice on a vendor's behalf while remaining view-only for everything
  // else (see is_view_only() in the DB — this role isn't in its exclusion list).
  const isLivecomUploader = hasRole("livecom_uploader");

  return {
    roles,
    isLoading,
    hasRole,
    isAdmin,
    isPlatformAdmin,
    isMaker,
    isApprover,
    isAccounts,
    isViewOnly,
    isLivecomUploader,
  };
}
