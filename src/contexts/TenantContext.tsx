import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  vendor_code_prefix: string;
  dpo_email: string | null;
  privacy_policy_url: string | null;
  support_email: string | null;
  support_phone: string | null;
}

interface TenantContextType {
  tenant: TenantConfig | null;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

/**
 * Resolves tenant slug from the current hostname.
 * Strategies:
 * 1. Exact domain match against tenants.slug (for custom domains)
 * 2. First subdomain segment as slug (e.g., insync.vendorportal.com)
 * 3. Falls back to "in-sync" for localhost/dev environments
 */
function resolveSlugFromHostname(): string {
  const hostname = window.location.hostname;

  // localhost / dev — use default tenant
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
    return "in-sync";
  }

  // If it looks like a direct domain (e.g., vendor.in-sync.co.in), use the first segment
  const parts = hostname.split(".");

  // Two-segment TLDs like .co.in need special handling
  // For subdomains like "abc.vendorportal.com" → slug = "abc"
  // For direct domains like "vendor.in-sync.co.in" → no matching slug → fall back to default
  if (parts.length >= 3) {
    // Could be subdomain.base.tld or domain.co.in
    // Simple heuristic: if first part isn't "www", use it as slug
    const candidate = parts[0];
    if (candidate !== "www") {
      return candidate;
    }
  }

  return "in-sync";
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTenant = async () => {
      try {
        const slug = resolveSlugFromHostname();

        const { data, error: fetchErr } = await supabase
          .from("tenants")
          .select("id, slug, name, short_name, logo_url, primary_color, accent_color, vendor_code_prefix, dpo_email, privacy_policy_url, support_email, support_phone")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (fetchErr) {
          // Table might not exist yet (pre-migration) — use defaults
          console.warn("Tenant fetch failed, using defaults:", fetchErr.message);
          setTenant(getDefaultTenant());
          setLoading(false);
          return;
        }

        if (!data) {
          // No matching tenant — try default
          const { data: fallback } = await supabase
            .from("tenants")
            .select("id, slug, name, short_name, logo_url, primary_color, accent_color, vendor_code_prefix, dpo_email, privacy_policy_url, support_email, support_phone")
            .eq("slug", "in-sync")
            .eq("is_active", true)
            .maybeSingle();

          if (fallback) {
            setTenant(fallback as TenantConfig);
            applyBranding(fallback as TenantConfig);
          } else {
            setTenant(getDefaultTenant());
          }
          setLoading(false);
          return;
        }

        setTenant(data as TenantConfig);
        applyBranding(data as TenantConfig);
        setLoading(false);
      } catch {
        // Graceful fallback if tenants table doesn't exist yet
        setTenant(getDefaultTenant());
        setLoading(false);
      }
    };

    loadTenant();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}

/** Apply tenant branding to CSS custom properties */
function applyBranding(tenant: TenantConfig) {
  const root = document.documentElement;

  if (tenant.primary_color) {
    root.style.setProperty("--primary", tenant.primary_color);
    root.style.setProperty("--ring", tenant.primary_color);
    root.style.setProperty("--sidebar-background", tenant.primary_color);
  }

  if (tenant.accent_color) {
    root.style.setProperty("--accent", tenant.accent_color);
  }

  // Update page title
  document.title = `${tenant.short_name} · Vendor-Sync`;
}

/** Hardcoded defaults for pre-migration or fallback */
function getDefaultTenant(): TenantConfig {
  return {
    id: "a0000000-0000-0000-0000-000000000001",
    slug: "in-sync",
    name: "In-Sync",
    short_name: "In-Sync",
    logo_url: null,
    primary_color: "204 100% 35%",
    accent_color: "92 47% 50%",
    vendor_code_prefix: "IS",
    dpo_email: "dpo@in-sync.co.in",
    privacy_policy_url: null,
    support_email: null,
    support_phone: null,
  };
}
