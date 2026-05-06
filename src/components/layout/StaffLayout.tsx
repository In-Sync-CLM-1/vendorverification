import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { StaffSidebar } from "./StaffSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface StaffLayoutProps {
  children: ReactNode;
  title?: string;
}

const PLATFORM_ALLOWED_PATHS = ["/platform/", "/staff/profile", "/staff/login"];

export function StaffLayout({ children, title }: StaffLayoutProps) {
  const { user, userType, loading, signOut } = useAuth();
  const { tenant } = useTenant();
  const { isPlatformAdmin, isLoading: rolesLoading } = useUserRoles();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/staff/login");
      return;
    }
    if (!loading && user && userType !== null && userType !== "staff") {
      navigate("/staff/login");
      return;
    }
    // Role-based redirects: platform admins must use /platform/*, regular
    // staff must NOT use /platform/*.
    if (!loading && !rolesLoading && user && userType === "staff") {
      const path = location.pathname;
      const isPlatformPath = path.startsWith("/platform/");
      const isAllowedForPlatform = PLATFORM_ALLOWED_PATHS.some((p) =>
        p.endsWith("/") ? path.startsWith(p) : path === p
      );
      if (isPlatformAdmin && !isAllowedForPlatform) {
        navigate("/platform/dashboard", { replace: true });
      } else if (!isPlatformAdmin && isPlatformPath) {
        navigate("/staff/dashboard", { replace: true });
      }
    }
  }, [user, userType, loading, rolesLoading, isPlatformAdmin, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!loading && user && userType === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-4">
          <p className="text-lg font-medium text-foreground">Account setup incomplete</p>
          <p className="text-sm text-muted-foreground">
            We couldn't link your account to a staff profile. Please sign out and try again, or contact support if the issue persists.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              navigate("/staff/login");
            }}
          >
            Sign out and try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <StaffSidebar />
        <SidebarInset>
          <header className="h-14 flex items-center justify-between border-b px-4 shrink-0">
            <div className="flex items-center">
              <SidebarTrigger className="mr-3" />
              {title && <h1 className="font-semibold text-lg truncate">{title}</h1>}
            </div>
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
          <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>DPO Contact: {tenant?.dpo_email || "dpo@company.com"}</span>
            <a href="/privacy-policy" target="_blank" className="hover:underline">Privacy Policy</a>
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
