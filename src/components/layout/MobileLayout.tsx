import { ReactNode } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface MobileLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  title?: string;
}

export function MobileLayout({ children, showHeader = true, title }: MobileLayoutProps) {
  const { tenant } = useTenant();
  const logo = useTenantLogo();

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-inset">
      {showHeader && (
        <header className="sticky top-0 z-50 bg-primary px-4 py-3 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/">
                <img
                  src={logo}
                  alt={tenant?.short_name || "Vendor-Sync"}
                  className="h-10 w-auto rounded bg-white p-1"
                />
              </a>
              {title && (
                <h1 className="text-lg font-semibold text-primary-foreground">
                  {title}
                </h1>
              )}
            </div>
            <NotificationBell variant="dark" />
          </div>
        </header>
      )}

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border bg-card px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <a href="/privacy-policy" className="hover:underline">Privacy Policy</a>
          {tenant?.dpo_email && (
            <>
              <span>•</span>
              <span>DPO: {tenant.dpo_email}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
