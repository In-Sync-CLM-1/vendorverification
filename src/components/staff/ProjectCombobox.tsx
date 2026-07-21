import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InternalProject {
  id: string;
  name: string;
}

interface ProjectComboboxProps {
  value: string | null;
  onChange: (projectId: string, projectName: string) => void;
  disabled?: boolean;
}

// There's no project-management module in this app — internal_projects is
// just a per-tenant lookup so staff can tag an advance request against the
// right internal project. Staff can add a new one on the fly here rather
// than needing a separate admin screen to manage the list.
export function ProjectCombobox({ value, onChange, disabled }: ProjectComboboxProps) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["internal-projects", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_projects")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data || []) as InternalProject[];
    },
    enabled: !!tenant?.id,
  });

  const selected = projects.find((p) => p.id === value);
  const trimmedSearch = search.trim();
  const exactMatch = projects.some((p) => p.name.toLowerCase() === trimmedSearch.toLowerCase());

  const handleCreate = async () => {
    if (!trimmedSearch || !tenant?.id) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("internal_projects")
        .insert({ tenant_id: tenant.id, name: trimmedSearch })
        .select("id, name")
        .single();
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ["internal-projects"] });
      onChange(data.id, data.name);
      setSearch("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setCreating(false);
    }
  };

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
          {selected ? selected.name : "Assign to project…"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or add a project…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No project found.</CommandEmpty>
                <CommandGroup>
                  {projects
                    .filter((p) => p.name.toLowerCase().includes(trimmedSearch.toLowerCase()))
                    .map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          onChange(p.id, p.name);
                          setSearch("");
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                        {p.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
                {trimmedSearch && !exactMatch && (
                  <CommandGroup>
                    <CommandItem value={`__create__${trimmedSearch}`} onSelect={handleCreate} disabled={creating}>
                      {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Create "{trimmedSearch}"
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
