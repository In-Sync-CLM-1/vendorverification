import { useRef } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { StaffEmailLogin } from "@/components/auth/StaffEmailLogin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProcessWalkthrough, chapters, type WalkthroughHandle } from "@/components/staff/ProcessWalkthrough";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";

// Inline SVG pattern for the background — a subtle connected-nodes / circuit motif
const bgPattern = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234f6d9a' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

export default function StaffLogin() {
  const walkthroughRef = useRef<WalkthroughHandle>(null);
  const { tenant } = useTenant();
  const logo = useTenantLogo();

  return (
    <MobileLayout showHeader={false}>
      <div className="flex-1 flex min-h-0">
        {/* Left column — 1/3 width: Login */}
        <div className="flex-1 lg:w-1/3 lg:flex-none flex flex-col items-center justify-center p-6 overflow-y-auto">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <a href="/"><img src={logo} alt={tenant?.short_name || "Vendor-Sync"} className="h-[6rem] w-auto rounded-lg bg-white p-2 shadow-sm" /></a>
              </div>
              <CardTitle className="text-2xl">Staff Login</CardTitle>
              <CardDescription>
                Sign in with your {tenant?.short_name || "organization"} email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StaffEmailLogin />
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-sm text-muted-foreground max-w-xs">
            Contact your administrator if you need access.
          </p>
        </div>

        {/* Right column — 2/3 width: Walkthrough + Step Cards */}
        <div
          className="hidden lg:flex lg:w-2/3 flex-col items-center justify-center gap-5 p-8 overflow-y-auto border-l relative"
          style={{
            background: `linear-gradient(135deg, #f0f4f8 0%, #e8eef6 30%, #dfe8f5 60%, #eee8f5 100%)`,
            backgroundImage: `${bgPattern}, linear-gradient(135deg, #f0f4f8 0%, #e8eef6 30%, #dfe8f5 60%, #eee8f5 100%)`,
          }}
        >
          {/* Decorative blurred circles */}
          <div className="absolute top-10 right-16 w-40 h-40 rounded-full bg-blue-300/15 blur-3xl pointer-events-none" />
          <div className="absolute bottom-16 left-10 w-52 h-52 rounded-full bg-indigo-300/15 blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full bg-amber-200/10 blur-2xl pointer-events-none" />

          {/* Title */}
          <div className="relative z-10 text-center">
            <h2 className="text-4xl font-bold text-slate-800 tracking-tight font-sans">Vendor Empanelment Platform</h2>
            <p className="text-base text-slate-500 mt-2 font-sans">See how the onboarding process works</p>
          </div>

          {/* Framed video container */}
          <div className="w-full max-w-3xl relative z-10">
            <div className="rounded-2xl overflow-hidden border-2 border-white/60 shadow-2xl ring-1 ring-black/5 bg-card aspect-video">
              <ProcessWalkthrough ref={walkthroughRef} />
            </div>
          </div>

          {/* Step Cards */}
          <div className="w-full max-w-3xl relative z-10">
            <h3 className="text-xs font-semibold text-slate-500 mb-2.5 text-center">Jump to Section</h3>
            <div className="grid grid-cols-7 gap-2">
              {chapters.map((ch, i) => (
                <button
                  key={i}
                  onClick={() => walkthroughRef.current?.goToSlide(ch.slideIndex)}
                  className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-white/60 bg-white/70 backdrop-blur-sm hover:bg-white hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 transition-all text-center"
                >
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${ch.color} group-hover:scale-110 transition-transform`}>
                    {ch.icon}
                  </div>
                  <span className="text-[10px] font-medium leading-tight">{ch.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
