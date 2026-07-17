import { useTenantLogo } from "@/hooks/useTenantLogo";
import { useTenant } from "@/contexts/TenantContext";
import { ReferralStepper } from "./ReferralStepper";

interface ReferralHeaderProps {
  currentStep?: number;
}

export function ReferralHeader({ currentStep = 0 }: ReferralHeaderProps) {
  const logo = useTenantLogo();
  const { tenant } = useTenant();

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2">
        <a href="/">
          <img
            src={logo}
            alt={tenant?.short_name || "Vendor-Sync"}
            className="h-8 object-contain shrink-0"
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
