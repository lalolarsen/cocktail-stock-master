import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Venue {
  id: string;
  name: string;
  is_demo: boolean;
}

interface VenueSelectorProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

export function VenueSelector({ selectedVenueId, onSelectVenue }: VenueSelectorProps) {
  const [open, setOpen] = useState(false);

  const { data: venues = [], isLoading, isError, error } = useQuery({
    queryKey: ["dev-venues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, is_demo")
        .order("name");
      if (error) throw error;
      return data as Venue[];
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const selectedVenue = venues.find(v => v.id === selectedVenueId);

  if (isLoading) {
    return (
      <Button variant="outline" disabled className="w-full justify-start gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando venues...
      </Button>
    );
  }

  if (isError) {
    return (
      <div className="p-3 border border-destructive/50 rounded-md bg-destructive/10 text-destructive text-sm">
        Error: {(error as Error).message}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0" />
            {selectedVenue ? (
              <span className="truncate">{selectedVenue.name}</span>
            ) : (
              <span className="text-muted-foreground">Seleccionar venue...</span>
            )}
            {selectedVenue?.is_demo && (
              <Badge variant="secondary" className="text-xs">Demo</Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar venue..." />
          <CommandList>
            <CommandEmpty>No se encontraron venues.</CommandEmpty>
            <CommandGroup>
              {venues.map((venue) => (
                <CommandItem
                  key={venue.id}
                  value={venue.name}
                  onSelect={() => {
                    onSelectVenue(venue.id === selectedVenueId ? null : venue.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedVenueId === venue.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{venue.name}</span>
                  {venue.is_demo && (
                    <Badge variant="secondary" className="text-xs ml-2">Demo</Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
