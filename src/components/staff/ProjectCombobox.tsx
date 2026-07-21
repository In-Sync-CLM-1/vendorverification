import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RmplProject {
  id: string;
  project_name: string;
}

interface ProjectComboboxProps {
  value: string | null;
  valueName?: string | null;
  onChange: (projectId: string, projectName: string) => void;
  disabled?: boolean;
}

// Project list is read live from RMPL (the org's separate project-tracking
// Supabase project) via the list-rmpl-projects edge function, filtered to
// projects currently in execution — RMPL owns this data, this app never
// creates or edits a project of its own.
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

  const filtered = projects.filter((p) => p.project_name.toLowerCase().includes(search.trim().toLowerCase()));
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
          <span className="truncate">{selectedName || "Assign to project…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search RMPL projects in execution…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <CommandEmpty>Could not load projects from RMPL.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No matching project in execution.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onChange(p.id, p.project_name);
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                      {p.project_name}
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
