import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCLP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Search, X, Ban } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

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

// Category display config with colors
const CATEGORY_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  popular:    { label: "🔥 Más Vendidos", color: "bg-primary/10 text-primary border-primary/30", order: 0 },
  destilados: { label: "Destilados", color: "bg-amber-500/10 text-amber-700 border-amber-200", order: 1 },
  shots:      { label: "Shots", color: "bg-red-500/10 text-red-700 border-red-200", order: 2 },
  cervezas:   { label: "Cervezas", color: "bg-yellow-500/10 text-yellow-700 border-yellow-200", order: 3 },
  cocktails:  { label: "Cocktails", color: "bg-purple-500/10 text-purple-700 border-purple-200", order: 4 },
  sin_alcohol:{ label: "Sin Alcohol", color: "bg-green-500/10 text-green-700 border-green-200", order: 5 },
  bebidas:    { label: "Bebidas", color: "bg-blue-500/10 text-blue-700 border-blue-200", order: 6 },
  snacks:     { label: "Snacks", color: "bg-orange-500/10 text-orange-700 border-orange-200", order: 7 },
  otros:      { label: "Otros", color: "bg-muted text-muted-foreground border-border", order: 99 },
};

/** Normalize category key to avoid duplicates ("Otros", "otros", " Otros ") */
function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "otros";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return key || "otros";
}

export function CategoryProductGrid({ cocktails, onAddToCart, jornadaId }: CategoryProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Debounce search 150ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch top selling products for current jornada
  const { data: topSelling = [] } = useQuery({
    queryKey: ["top-selling-products", jornadaId],
    queryFn: async () => {
      if (!jornadaId) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select(`cocktail_id, quantity, sales!inner(jornada_id, is_cancelled)`)
        .eq("sales.jornada_id", jornadaId)
        .eq("sales.is_cancelled", false);
      if (error) return [];
      const agg: Record<string, number> = {};
      data?.forEach((item) => {
        agg[item.cocktail_id] = (agg[item.cocktail_id] || 0) + (item.quantity || 0);
      });
      return Object.entries(agg)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
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
    if (popularProducts.length > 0) groups["popular"] = popularProducts;
    normalizedCocktails.forEach((cocktail) => {
      const cat = cocktail.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cocktail);
    });
    // Sort alphabetically within each group (except popular)
    Object.keys(groups).forEach((cat) => {
      if (cat !== "popular") groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    return groups;
  }, [normalizedCocktails, popularProducts]);

  // Sorted category keys
  const sortedCategories = useMemo(() => {
    return Object.keys(categorizedProducts).sort((a, b) => {
      const aOrder = CATEGORY_CONFIG[a]?.order ?? 98;
      const bOrder = CATEGORY_CONFIG[b]?.order ?? 98;
      return aOrder - bOrder;
    });
  }, [categorizedProducts]);

  // Search-filtered products (flat list when searching)
  const searchResults = useMemo(() => {
    if (!debouncedSearch) return null;
    const q = debouncedSearch.toLowerCase();
    return normalizedCocktails.filter(
      (c) => c.name.toLowerCase().includes(q) || c.category.includes(q)
    );
  }, [debouncedSearch, normalizedCocktails]);

  // Products to display
  const displayProducts = useMemo(() => {
    if (searchResults) return { resultados: searchResults };
    if (selectedCategory) return { [selectedCategory]: categorizedProducts[selectedCategory] || [] };
    return categorizedProducts;
  }, [searchResults, selectedCategory, categorizedProducts]);

  const getCategoryConfig = (category: string) =>
    CATEGORY_CONFIG[category] || { label: category, color: CATEGORY_CONFIG.otros.color, order: 98 };

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

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Sticky search bar */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Buscar producto…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="pl-9 pr-9 h-11"
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

      {/* Category chips – horizontal snap scroll */}
      {!isSearching && (
        <div
          ref={chipsRef}
          className="flex gap-2 overflow-x-auto pb-1 shrink-0 snap-x snap-mandatory scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer shrink-0 px-3 py-2 text-sm font-medium transition-all snap-start min-h-[44px] flex items-center",
              !selectedCategory
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            )}
            onClick={() => setSelectedCategory(null)}
          >
            Todo ({normalizedCocktails.length})
          </Badge>
          {sortedCategories.map((category) => {
            const config = getCategoryConfig(category);
            const count = categorizedProducts[category]?.length || 0;
            const isSelected = selectedCategory === category;
            return (
              <Badge
                key={category}
                variant="outline"
                className={cn(
                  "cursor-pointer shrink-0 px-3 py-2 text-sm font-medium transition-all snap-start min-h-[44px] flex items-center",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : config.color,
                  "hover:opacity-80"
                )}
                onClick={() => setSelectedCategory(isSelected ? null : category)}
              >
                {category === "popular" && <Flame className="w-3 h-3 mr-1" />}
                {config.label} ({count})
              </Badge>
            );
          })}
        </div>
      )}

      {/* Products grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-4 pr-1">
          {Object.entries(displayProducts).map(([category, products]) => {
            const config = getCategoryConfig(category);
            const isPopular = category === "popular";

            return (
              <div key={category}>
                {/* Category header */}
                {!selectedCategory && !isSearching && (
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                    <Badge variant="outline" className={cn("text-xs", config.color)}>
                      {isPopular && <Flame className="w-3 h-3 mr-1" />}
                      {config.label}
                    </Badge>
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-xs text-muted-foreground">{products.length}</span>
                  </div>
                )}

                <div
                  className={cn(
                    "grid gap-2",
                    isPopular
                      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
                      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                  )}
                >
                  {products.map((cocktail) => {
                    const hasNoPrice = !cocktail.price || cocktail.price <= 0;
                    return (
                      <ProductCard
                        key={cocktail.id}
                        cocktail={cocktail}
                        isPopular={isPopular}
                        hasNoPrice={hasNoPrice}
                        onAddToCart={onAddToCart}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {normalizedCocktails.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No hay productos disponibles
            </div>
          )}

          {isSearching && searchResults?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Sin resultados para "{debouncedSearch}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Extracted product card for performance (React.memo) */
import React from "react";

const ProductCard = React.memo(function ProductCard({
  cocktail,
  isPopular,
  hasNoPrice,
  onAddToCart,
}: {
  cocktail: Cocktail;
  isPopular: boolean;
  hasNoPrice: boolean;
  onAddToCart: (c: Cocktail) => void;
}) {
  if (hasNoPrice) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card
              className={cn(
                "p-3 select-none opacity-50 cursor-not-allowed min-h-[80px] flex items-center justify-center",
                isPopular && "border-primary/20 bg-primary/5"
              )}
            >
              <div className="text-center space-y-0.5">
                <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                  {cocktail.name}
                </h3>
                <div className="text-xs text-destructive flex items-center justify-center gap-1">
                  <Ban className="w-3 h-3" /> Sin precio
                </div>
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Producto sin precio configurado, no se puede vender</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card
      className={cn(
        "p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/50 active:scale-[0.97] select-none min-h-[80px] flex items-center justify-center",
        isPopular && "border-primary/20 bg-primary/5"
      )}
      onClick={() => onAddToCart(cocktail)}
    >
      <div className="text-center space-y-0.5">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
          {cocktail.name}
        </h3>
        <div className="text-lg font-bold text-primary">
          {formatCLP(cocktail.price)}
        </div>
      </div>
    </Card>
  );
});
