import { useEffect, useState } from "react";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { ReferralStepper } from "./ReferralStepper";

interface ReferralHeaderProps {
  currentStep?: number;
  // The referring tenant, resolved by the caller from the referral link
  // itself. This page is unauthenticated, so it can't rely on the global
  // tenant context (which only knows the hostname's default org) — pass
  // the referred vendor's actual org through explicitly so they see whose
  // link they followed, not always the platform default.
  tenantId?: string | null;
}

export function ReferralHeader({ currentStep = 0, tenantId }: ReferralHeaderProps) {
  const defaultLogo = useTenantLogo();
  const { tenant: defaultTenant } = useTenant();
  const [referringTenant, setReferringTenant] = useState<{ logo_url: string | null; short_name: string } | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setReferringTenant(null);
      return;
    }
    supabase
      .from("tenants")
      .select("logo_url, short_name")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data }) => setReferringTenant(data));
  }, [tenantId]);

  const logo = referringTenant?.logo_url || defaultLogo;
  const name = referringTenant?.short_name || defaultTenant?.short_name || "Vendor-Sync";

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2">
        <a href="/">
          <img
            src={logo}
            alt={name}
            className="h-10 max-w-[160px] object-contain shrink-0"
          />
        </a>
        <h1 className="text-sm font-semibold text-primary whitespace-nowrap">
          Vendor Registration
        </h1>
        <div className="flex-1 min-w-0">
          <ReferralStepper currentStep={currentStep} />
        </div>
      </div>
    </header>
  );
}
