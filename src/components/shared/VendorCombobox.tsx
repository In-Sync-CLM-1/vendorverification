import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VendorOption {
  id: string;
  company_name: string;
  vendor_code: string | null;
}

interface VendorComboboxProps {
  value: string | null;
  valueName?: string | null;
  onChange: (vendor: VendorOption) => void;
  disabled?: boolean;
}

// Only approved vendors can receive an invoice (same rule as a vendor
// submitting their own — see submit_livecom_invoice()).
export function VendorCombobox({ value, valueName, onChange, disabled }: VendorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: vendors = [], isLoading, isError } = useQuery({
    queryKey: ["approved-vendors-for-upload"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, company_name, vendor_code")
        .eq("current_status", "approved")
        .order("company_name");
      if (error) throw error;
      return (data || []) as VendorOption[];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const needle = search.trim().toLowerCase();
  const filtered = vendors.filter(
    (v) =>
      v.company_name.toLowerCase().includes(needle) ||
      (v.vendor_code || "").toLowerCase().includes(needle)
  );
  const selectedName = vendors.find((v) => v.id === value)?.company_name || valueName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedName || "Select vendor…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by company name or vendor code…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <CommandEmpty>Could not load vendors.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No matching approved vendor.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((v) => (
                    <CommandItem
                      key={v.id}
                      value={v.id}
                      onSelect={() => {
                        onChange(v);
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === v.id ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{v.company_name}</span>
                      {v.vendor_code && (
                        <span className="ml-2 text-xs text-muted-foreground shrink-0">{v.vendor_code}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
