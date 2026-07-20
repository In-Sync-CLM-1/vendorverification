import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Eye, EyeOff, ShieldAlert, X } from "lucide-react";

type VendorMatch = {
  id: string;
  vendor_code: string | null;
  company_name: string;
  current_status: string;
};

type SensitiveInfo = {
  id: string;
  vendor_code: string | null;
  company_name: string;
  current_status: string;
  primary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  pan_number: string | null;
  gst_number: string | null;
  cin_number: string | null;
  msme_number: string | null;
};

const REVEAL_TIMEOUT_MS = 20_000;

function maskTail(value: string | null, keep = 4): string {
  if (!value) return "Not on file";
  if (value.length <= keep) return "•".repeat(value.length);
  return "•".repeat(value.length - keep) + value.slice(-keep);
}

function maskMiddle(value: string | null): string {
  if (!value) return "Not on file";
  if (value.length <= 4) return "•".repeat(value.length);
  return value.slice(0, 2) + "•".repeat(value.length - 4) + value.slice(-2);
}

function maskEmail(value: string | null): string {
  if (!value) return "Not on file";
  const at = value.indexOf("@");
  if (at <= 0) return "•".repeat(value.length);
  return value.slice(0, Math.min(2, at)) + "•••" + value.slice(at);
}

const SENSITIVE_FIELDS: {
  key: keyof SensitiveInfo;
  label: string;
  mask: (v: string | null) => string;
}[] = [
  { key: "primary_email", label: "Email", mask: maskEmail },
  { key: "primary_mobile", label: "Mobile Number", mask: (v) => maskTail(v, 2) },
  { key: "secondary_mobile", label: "Secondary Mobile", mask: (v) => maskTail(v, 2) },
  { key: "bank_account_number", label: "Bank Account Number", mask: (v) => maskTail(v, 4) },
  { key: "bank_ifsc", label: "Bank IFSC", mask: maskMiddle },
  { key: "pan_number", label: "PAN Number", mask: maskMiddle },
  { key: "gst_number", label: "GST Number", mask: maskMiddle },
  { key: "cin_number", label: "CIN Number", mask: maskMiddle },
  { key: "msme_number", label: "MSME Number", mask: maskMiddle },
];

const VendorSensitiveInfo = () => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VendorMatch | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const clearAllReveals = () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setRevealed({});
  };

  // Re-mask everything the instant the tab loses focus/visibility, or on unmount.
  useEffect(() => {
    const onHide = () => clearAllReveals();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHide();
    });
    window.addEventListener("blur", onHide);
    return () => {
      window.removeEventListener("blur", onHide);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  // Block browser print for this screen — printing is a form of export.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: matches = [], isFetching: searching } = useQuery({
    queryKey: ["vendor-sensitive-search", search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, vendor_code, company_name, current_status")
        .or(`company_name.ilike.%${search}%,vendor_code.ilike.%${search}%`)
        .order("company_name")
        .limit(15);
      if (error) throw error;
      return (data || []) as VendorMatch[];
    },
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  });

  const {
    data: info,
    isFetching: loadingInfo,
    error: infoError,
  } = useQuery({
    queryKey: ["vendor-sensitive-info", selected?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_sensitive_info" as any, {
        p_vendor_id: selected!.id,
      } as any);
      if (error) throw error;
      return data as unknown as SensitiveInfo;
    },
    enabled: !!selected,
    staleTime: 0,
    gcTime: 0,
  });

  const selectVendor = (v: VendorMatch) => {
    clearAllReveals();
    setSelected(v);
    setSearch("");
  };

  const closeVendor = () => {
    clearAllReveals();
    setSelected(null);
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const isRevealed = !!prev[key];
      if (timers.current[key]) {
        clearTimeout(timers.current[key]);
        delete timers.current[key];
      }
      if (isRevealed) {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      timers.current[key] = setTimeout(() => {
        setRevealed((p) => {
          const { [key]: _drop, ...rest } = p;
          return rest;
        });
      }, REVEAL_TIMEOUT_MS);
      return { ...prev, [key]: true };
    });
  };

  return (
    <StaffLayout title="Vendor Sensitive Info">
      <style>{`
        @media print {
          .vendor-sensitive-guard { display: none !important; }
          .vendor-sensitive-print-block::after {
            content: "This page cannot be printed.";
            display: block;
            padding: 2rem;
            text-align: center;
          }
        }
      `}</style>
      <div className="space-y-4 vendor-sensitive-print-block">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Look up one vendor at a time. Fields stay masked until you reveal them, and reveal
            automatically after {REVEAL_TIMEOUT_MS / 1000}s or the moment you switch tabs. Copy,
            selection, and printing are disabled on this page.
          </span>
        </div>

        {!selected && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search a vendor by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoComplete="off"
            />
            {search.trim().length >= 2 && (
              <Card className="absolute z-10 mt-1 w-full max-h-72 overflow-auto">
                <CardContent className="p-1">
                  {searching ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
                  ) : matches.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No vendors found</div>
                  ) : (
                    matches.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => selectVendor(v)}
                        className="w-full text-left px-3 py-2 rounded hover:bg-muted/60 text-sm flex items-center justify-between"
                      >
                        <span>
                          <span className="font-medium">{v.company_name}</span>
                          {v.vendor_code && (
                            <span className="text-muted-foreground ml-2 font-mono text-xs">
                              {v.vendor_code}
                            </span>
                          )}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {v.current_status.replace(/_/g, " ")}
                        </Badge>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {selected && (
          <div
            ref={containerRef}
            className="vendor-sensitive-guard select-none"
            onContextMenu={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            style={{ userSelect: "none", WebkitUserSelect: "none" }}
          >
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-lg">{selected.company_name}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {selected.vendor_code || "—"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closeVendor} title="Close">
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {loadingInfo && (
                  <p className="text-sm text-muted-foreground">Loading vendor details...</p>
                )}
                {infoError && (
                  <p className="text-sm text-destructive">
                    Could not load this vendor's details. You may not have access.
                  </p>
                )}

                {info && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {SENSITIVE_FIELDS.map(({ key, label, mask }) => {
                      const raw = info[key];
                      const isRevealed = !!revealed[key];
                      const displayValue = raw
                        ? isRevealed
                          ? raw
                          : mask(raw)
                        : "Not on file";
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between border rounded-md px-3 py-2"
                        >
                          <div>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="font-mono text-sm">{displayValue}</p>
                          </div>
                          {raw && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleReveal(key as string)}
                              title={isRevealed ? "Hide" : "Reveal"}
                            >
                              {isRevealed ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {(info.bank_name || info.bank_branch) && (
                      <div className="border rounded-md px-3 py-2 sm:col-span-2">
                        <p className="text-xs text-muted-foreground">Bank</p>
                        <p className="text-sm">
                          {[info.bank_name, info.bank_branch].filter(Boolean).join(", ") || "—"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </StaffLayout>
  );
};

export default VendorSensitiveInfo;
