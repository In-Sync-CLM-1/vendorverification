import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export interface RmplProject {
  id: string;
  project_name: string;
  project_number: string | null;
  project_owner_external_id: string | null;
  project_owner_name: string | null;
  project_owner_email: string | null;
  project_owner_user_id: string | null;
  /** True when the project's own owner has no account here and the PI is going to the fallback approver (Accounts) instead. */
  routed_to_default_approver?: boolean;
}

interface ProjectComboboxProps {
  value: string | null;
  valueName?: string | null;
  onChange: (project: RmplProject) => void;
  disabled?: boolean;
}

// Projects are searched live in RMPL (the org's separate project-tracking
// Supabase project) via the list-rmpl-projects edge function — every status,
// matched by name or number as the user types — RMPL owns this data, this app never
// creates or edits a project of its own. Each project also carries its
// resolved owner (matched into this app's own staff accounts by email) so
// callers can route approvals without a separate picker. Used by both staff
// (tagging an advance request) and vendors (submitting a PI/Quotation).
export function ProjectCombobox({ value, valueName, onChange, disabled }: ProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const term = useDebouncedValue(search.trim(), 250);

  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ["rmpl-projects", term],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-rmpl-projects", { body: { search: term } });
      if (error) throw new Error("Could not load projects from RMPL");
      return (data?.projects || []) as RmplProject[];
    },
    enabled: open,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const filtered = projects; // matched by name or number on the server
  const selectedName = projects.find((p) => p.id === value)?.project_name || valueName;

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
          <span className="truncate">{selectedName || "Select project…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by project name or number…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <CommandEmpty>Could not load projects from RMPL.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No matching project.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onChange(p);
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{p.project_name}</span>
                      {p.project_number && (
                        <span className="ml-2 text-xs text-muted-foreground shrink-0">{p.project_number}</span>
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
