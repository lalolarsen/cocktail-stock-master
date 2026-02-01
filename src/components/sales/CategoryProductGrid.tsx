import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCLP } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Cocktail = {
  id: string;
  name: string;
  price: number;
  category: string;
};

interface CategoryProductGridProps {
  cocktails: Cocktail[];
  onAddToCart: (cocktail: Cocktail) => void;
}

// Category display config with colors
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  destilados: { label: "Destilados", color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  shots: { label: "Shots", color: "bg-red-500/10 text-red-700 border-red-200" },
  cervezas: { label: "Cervezas", color: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  cocktails: { label: "Cocktails", color: "bg-purple-500/10 text-purple-700 border-purple-200" },
  sin_alcohol: { label: "Sin Alcohol", color: "bg-green-500/10 text-green-700 border-green-200" },
  bebidas: { label: "Bebidas", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  snacks: { label: "Snacks", color: "bg-orange-500/10 text-orange-700 border-orange-200" },
  otros: { label: "Otros", color: "bg-muted text-muted-foreground border-border" },
};

// Category priority order
const CATEGORY_ORDER = ["destilados", "shots", "cervezas", "cocktails", "bebidas", "sin_alcohol", "snacks", "otros"];

export function CategoryProductGrid({ cocktails, onAddToCart }: CategoryProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Group products by category
  const categorizedProducts = useMemo(() => {
    const groups: Record<string, Cocktail[]> = {};
    
    cocktails.forEach((cocktail) => {
      const category = cocktail.category || "otros";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(cocktail);
    });

    // Sort each category's products alphabetically
    Object.keys(groups).forEach((cat) => {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [cocktails]);

  // Get sorted categories based on priority order
  const sortedCategories = useMemo(() => {
    const cats = Object.keys(categorizedProducts);
    return cats.sort((a, b) => {
      const aIdx = CATEGORY_ORDER.indexOf(a);
      const bIdx = CATEGORY_ORDER.indexOf(b);
      const aOrder = aIdx === -1 ? 999 : aIdx;
      const bOrder = bIdx === -1 ? 999 : bIdx;
      return aOrder - bOrder;
    });
  }, [categorizedProducts]);

  // Products to display (filtered or all)
  const displayProducts = useMemo(() => {
    if (selectedCategory) {
      return { [selectedCategory]: categorizedProducts[selectedCategory] || [] };
    }
    return categorizedProducts;
  }, [selectedCategory, categorizedProducts]);

  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.otros;
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Category filter tabs - compact horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        <Badge
          variant="outline"
          className={cn(
            "cursor-pointer shrink-0 px-3 py-1.5 text-sm font-medium transition-all",
            !selectedCategory 
              ? "bg-primary text-primary-foreground border-primary" 
              : "hover:bg-muted"
          )}
          onClick={() => setSelectedCategory(null)}
        >
          Todo ({cocktails.length})
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
                "cursor-pointer shrink-0 px-3 py-1.5 text-sm font-medium transition-all",
                isSelected 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : config.color,
                "hover:opacity-80"
              )}
              onClick={() => setSelectedCategory(isSelected ? null : category)}
            >
              {config.label} ({count})
            </Badge>
          );
        })}
      </div>

      {/* Products grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 pr-2">
          {Object.entries(displayProducts).map(([category, products]) => {
            const config = getCategoryConfig(category);
            
            return (
              <div key={category}>
                {/* Category header - only show if not filtered */}
                {!selectedCategory && (
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                    <Badge variant="outline" className={cn("text-xs", config.color)}>
                      {config.label}
                    </Badge>
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-xs text-muted-foreground">{products.length}</span>
                  </div>
                )}

                {/* Products in this category */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {products.map((cocktail) => (
                    <Card
                      key={cocktail.id}
                      className="p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/50 active:scale-[0.98] select-none"
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
                  ))}
                </div>
              </div>
            );
          })}

          {cocktails.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No hay productos disponibles
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
