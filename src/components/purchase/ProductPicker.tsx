import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
}

interface ProductPickerProps {
  venueId: string;
  value: string | null;
  displayName?: string;
  disabled?: boolean;
  onSelect: (productId: string | null, productName: string) => void;
}

export default function ProductPicker({ venueId, value, displayName, disabled, onSelect }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchProducts = async (search: string) => {
    if (!venueId) return;
    setLoading(true);
    setError(false);

    let q = supabase
      .from("products")
      .select("id, name, code, category")
      .eq("venue_id", venueId)
      .order("name")
      .limit(300);

    if (search.trim()) {
      q = q.ilike("name", `%${search.trim()}%`);
    }

    const { data, error: err } = await q;
    if (err) {
      console.error("ProductPicker fetch error:", err);
      setError(true);
      setProducts([]);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  // Load on open
  useEffect(() => {
    if (open) {
      fetchProducts(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(val), 300);
  };

  const selectedLabel = value
    ? displayName || products.find(p => p.id === value)?.name || "Producto seleccionado"
    : "Seleccionar producto";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-7 w-full justify-between text-xs font-normal px-2",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 z-50" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar producto..."
            value={query}
            onValueChange={handleSearch}
            className="text-xs"
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && !loading && (
              <div className="px-3 py-4 text-xs text-destructive text-center">
                No se pudo cargar productos. Revisa permisos/RLS.
              </div>
            )}
            {!loading && !error && products.length === 0 && (
              <CommandEmpty className="text-xs">No se encontraron productos</CommandEmpty>
            )}
            {!loading && !error && products.length > 0 && (
              <CommandGroup>
                {products.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onSelect(p.id, p.name);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-1.5 h-3 w-3", value === p.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {p.code ? p.code : ""}{p.code && p.category ? " · " : ""}{p.category || ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
