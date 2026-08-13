import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RmplProject {
  id: string;
  project_name: string;
  project_number: string | null;
  project_owner_external_id: string | null;
  project_owner_name: string | null;
  project_owner_email: string | null;
  project_owner_user_id: string | null;
}

interface ProjectComboboxProps {
  value: string | null;
  valueName?: string | null;
  onChange: (project: RmplProject) => void;
  disabled?: boolean;
}

// Project list is read live from RMPL (the org's separate project-tracking
// Supabase project) via the list-rmpl-projects edge function, filtered to
// projects currently in execution plus the standing internal-billing project
// (RMPL-26-999) — RMPL owns this data, this app never
// creates or edits a project of its own. Each project also carries its
// resolved owner (matched into this app's own staff accounts by email) so
// callers can route approvals without a separate picker. Used by both staff
// (tagging an advance request) and vendors (submitting a PI/Quotation).
export function ProjectCombobox({ value, valueName, onChange, disabled }: ProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ["rmpl-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-rmpl-projects");
      if (error) throw new Error("Could not load projects from RMPL");
      return (data?.projects || []) as RmplProject[];
    },
    enabled: open,
    staleTime: 60_000,
  });

  // Match on project number as well as name — people look a project up by its
  // number ("RMPL-26-999") at least as often as by its name.
  const needle = search.trim().toLowerCase();
  const filtered = projects.filter(
    (p) =>
      p.project_name.toLowerCase().includes(needle) ||
      (p.project_number || "").toLowerCase().includes(needle)
  );
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
