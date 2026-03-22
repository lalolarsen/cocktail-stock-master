import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Search, X, Ban, PackageOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  normalizeCategory,
  getCategoryDef,
  compareCategoryOrder,
} from "@/lib/categories";

type Cocktail = {
  id: string;
  name: string;
  price: number;
  category: string;
};

interface CategoryProductGridProps {
  cocktails: Cocktail[];
  onAddToCart: (cocktail: Cocktail) => void;
  jornadaId?: string | null;
}

const ITEMS_PER_PAGE = 40;

export function CategoryProductGrid({ cocktails, onAddToCart, jornadaId }: CategoryProductGridProps) {
  // "popular" is the default selected category
  const [selectedCategory, setSelectedCategory] = useState<string>("popular");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Reset visible count when category changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [selectedCategory]);

  // Debounce search 150ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch top selling products for current jornada (top 12)
  const { data: topSelling = [] } = useQuery({
    queryKey: ["top-selling-products", jornadaId],
    queryFn: async () => {
      if (!jornadaId) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select(`cocktail_id, quantity, sales!sale_items_sale_id_fkey!inner(jornada_id, is_cancelled)`)
        .eq("sales.jornada_id", jornadaId)
        .eq("sales.is_cancelled", false);
      if (error) return [];
      const agg: Record<string, number> = {};
      data?.forEach((item) => {
        agg[item.cocktail_id] = (agg[item.cocktail_id] || 0) + (item.quantity || 0);
      });
      return Object.entries(agg)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([id, qty]) => ({ cocktailId: id, quantity: qty }));
    },
    enabled: !!jornadaId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Normalize all cocktails' categories
  const normalizedCocktails = useMemo(() => {
    return cocktails.map((c) => ({
      ...c,
      category: normalizeCategory(c.category),
    }));
  }, [cocktails]);

  // Popular products
  const popularProducts = useMemo(() => {
    if (topSelling.length === 0) return [];
    return topSelling
      .map((ts) => normalizedCocktails.find((c) => c.id === ts.cocktailId))
      .filter(Boolean) as Cocktail[];
  }, [topSelling, normalizedCocktails]);

  // Group products by normalized category
  const categorizedProducts = useMemo(() => {
    const groups: Record<string, Cocktail[]> = {};
    groups["popular"] = popularProducts;
    normalizedCocktails.forEach((cocktail) => {
      const cat = cocktail.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cocktail);
    });
    Object.keys(groups).forEach((cat) => {
      if (cat !== "popular") groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    return groups;
  }, [normalizedCocktails, popularProducts]);

  // Sorted category keys
  const sortedCategories = useMemo(() => {
    return Object.keys(categorizedProducts).sort((a, b) => {
      if (a === "popular") return -1;
      if (b === "popular") return 1;
      return compareCategoryOrder(a, b);
    });
  }, [categorizedProducts]);

  // Search-filtered products
  const searchResults = useMemo(() => {
    if (!debouncedSearch) return null;
    const q = debouncedSearch.toLowerCase();
    return normalizedCocktails.filter(
      (c) => c.name.toLowerCase().includes(q) || c.category.includes(q)
    );
  }, [debouncedSearch, normalizedCocktails]);

  // Products to display — only the selected category (lazy)
  const displayProducts = useMemo((): Cocktail[] => {
    if (searchResults) return searchResults;
    return categorizedProducts[selectedCategory] || [];
  }, [searchResults, selectedCategory, categorizedProducts]);

  // Paginated slice
  const visibleProducts = useMemo(() => {
    return displayProducts.slice(0, visibleCount);
  }, [displayProducts, visibleCount]);

  const hasMore = displayProducts.length > visibleCount;

  const getLabel = (category: string) => {
    if (category === "popular") return "Más vendidos";
    return getCategoryDef(category).label;
  };

  // Enter key in search = add first result
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && searchResults && searchResults.length > 0) {
        const first = searchResults[0];
        if (first.price > 0) {
          onAddToCart(first);
          setSearchQuery("");
        }
      }
    },
    [searchResults, onAddToCart]
  );

  const isSearching = debouncedSearch.length > 0;
  const isPopularEmpty = selectedCategory === "popular" && popularProducts.length === 0 && !isSearching;

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Buscar producto…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="pl-9 pr-9 h-12 text-base bg-card border-border/50"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category chips */}
      {!isSearching && (
        <div
          ref={chipsRef}
          className="flex gap-1.5 overflow-x-auto pb-1 shrink-0 snap-x snap-mandatory scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {sortedCategories.map((category) => {
            const isSelected = selectedCategory === category;
            const isPopular = category === "popular";
            return (
              <button
                key={category}
                type="button"
                className={cn(
                  "shrink-0 px-4 py-2 text-sm font-medium rounded-md transition-all snap-start min-h-[44px] whitespace-nowrap border",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border/40 hover:border-border hover:text-foreground"
                )}
                onClick={() => setSelectedCategory(category)}
              >
                {isPopular && <Flame className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                {getLabel(category)}
              </button>
            );
          })}
        </div>
      )}

      {/* Products grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Popular empty state */}
        {isPopularEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
            <Flame className="w-10 h-10 text-muted-foreground/30" />
            <div>
              <p className="text-muted-foreground font-medium">Aún no hay ventas</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Esta sección se activará automáticamente con las primeras ventas de la jornada.
              </p>
            </div>
          </div>
        )}

        {/* Category empty state */}
        {!isPopularEmpty && displayProducts.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
            <PackageOpen className="w-10 h-10 text-muted-foreground/30" />
            <div>
              <p className="text-muted-foreground font-medium">No hay productos en esta categoría</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Usa el buscador o selecciona otra categoría
              </p>
            </div>
          </div>
        )}

        {/* Search no results */}
        {isSearching && searchResults?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            <Search className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              Sin resultados para "<span className="font-medium text-foreground">{debouncedSearch}</span>"
            </p>
          </div>
        )}

        {/* Product cards */}
        {visibleProducts.length > 0 && (
          <div className="space-y-3 pr-1">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleProducts.map((cocktail) => (
                <ProductCard
                  key={cocktail.id}
                  cocktail={cocktail}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>

            {hasMore && (
              <div className="text-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setVisibleCount((p) => p + ITEMS_PER_PAGE)}
                >
                  Cargar más ({displayProducts.length - visibleCount} restantes)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Global empty: no cocktails at all */}
        {normalizedCocktails.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
            <PackageOpen className="w-10 h-10 text-muted-foreground/30" />
            <div>
              <p className="text-muted-foreground font-medium">No hay productos disponibles</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                No hay categorías configuradas para venta
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Product card — memoized for performance */
const ProductCard = React.memo(function ProductCard({
  cocktail,
  onAddToCart,
}: {
  cocktail: Cocktail;
  onAddToCart: (c: Cocktail) => void;
}) {
  const hasNoPrice = !cocktail.price || cocktail.price <= 0;

  if (hasNoPrice) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="p-2 select-none opacity-40 cursor-not-allowed min-h-[68px] flex flex-col items-start justify-center rounded-md border border-border/30 bg-card/50"
            >
              <span className="text-xs font-medium leading-snug line-clamp-2 w-full">
                {cocktail.name}
              </span>
              <span className="text-xs text-destructive flex items-center gap-1 mt-1">
                <Ban className="w-3 h-3" /> Sin precio
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Producto sin precio configurado</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      type="button"
      className="p-3 text-left rounded-md border border-border/30 bg-card hover:border-primary/50 active:scale-[0.97] transition-all select-none min-h-[72px] flex flex-col justify-between w-full"
      onClick={() => onAddToCart(cocktail)}
    >
      <span className="text-sm font-medium leading-tight line-clamp-1 text-foreground">
        {cocktail.name}
      </span>
      <span className="text-lg font-bold text-primary mt-1">
        {formatCLP(cocktail.price)}
      </span>
    </button>
  );
});
