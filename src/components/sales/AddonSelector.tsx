import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Check, X } from "lucide-react";
import { formatCLP } from "@/lib/currency";

export type SelectedAddon = {
  id: string;
  name: string;
  price: number;
};

type ProductAddon = {
  id: string;
  name: string;
  price_modifier: number;
};

interface AddonSelectorProps {
  cocktailId: string;
  venueId: string;
  selectedAddons: SelectedAddon[];
  onAddonsChange: (addons: SelectedAddon[]) => void;
  compact?: boolean;
}

export function AddonSelector({
  cocktailId,
  venueId,
  selectedAddons,
  onAddonsChange,
  compact = false,
}: AddonSelectorProps) {
  const [availableAddons, setAvailableAddons] = useState<ProductAddon[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cocktailId && venueId) {
      fetchAvailableAddons();
    }
  }, [cocktailId, venueId]);

  const fetchAvailableAddons = async () => {
    setLoading(true);
    try {
      // Get addons assigned to this cocktail
      const { data, error } = await supabase
        .from("cocktail_addons")
        .select(`
          addon_id,
          product_addons!inner(
            id,
            name,
            price_modifier,
            is_active
          )
        `)
        .eq("cocktail_id", cocktailId);

      if (error) throw error;

      // Filter active addons and flatten
      const addons = (data || [])
        .map((ca: any) => ca.product_addons)
        .filter((addon: ProductAddon & { is_active: boolean }) => addon.is_active);

      setAvailableAddons(addons);
    } catch (error) {
      console.error("Error fetching addons:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAddon = (addon: ProductAddon) => {
    const isSelected = selectedAddons.some(a => a.id === addon.id);
    
    if (isSelected) {
      onAddonsChange(selectedAddons.filter(a => a.id !== addon.id));
    } else {
      onAddonsChange([
        ...selectedAddons,
        { id: addon.id, name: addon.name, price: addon.price_modifier },
      ]);
    }
  };

  const removeAddon = (addonId: string) => {
    onAddonsChange(selectedAddons.filter(a => a.id !== addonId));
  };

  // No addons available for this product
  if (availableAddons.length === 0 && !loading) {
    return null;
  }

  // Show selected addons as badges (compact mode for cart view)
  if (compact && selectedAddons.length > 0) {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {selectedAddons.map(addon => (
          <Badge
            key={addon.id}
            variant="secondary"
            className="text-xs cursor-pointer hover:bg-destructive/20"
            onClick={(e) => {
              e.stopPropagation();
              removeAddon(addon.id);
            }}
          >
            {addon.name}
            {addon.price > 0 && ` +${formatCLP(addon.price)}`}
            <X className="w-3 h-3 ml-1" />
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={loading || availableAddons.length === 0}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add-on
          {selectedAddons.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1">
              {selectedAddons.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Agregar modificadores
          </p>
          {availableAddons.map(addon => {
            const isSelected = selectedAddons.some(a => a.id === addon.id);
            return (
              <div
                key={addon.id}
                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10" : "hover:bg-muted"
                }`}
                onClick={() => toggleAddon(addon)}
              >
                <div className="flex items-center gap-2">
                  <Checkbox checked={isSelected} />
                  <span className="text-sm">{addon.name}</span>
                </div>
                {addon.price_modifier > 0 ? (
                  <span className="text-xs text-primary font-medium">
                    +{formatCLP(addon.price_modifier)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Gratis</span>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Hook to fetch available addons for a cocktail (for checking if selector should show)
export function useHasAddons(cocktailId: string, venueId: string) {
  const [hasAddons, setHasAddons] = useState(false);

  useEffect(() => {
    if (!cocktailId || !venueId) {
      setHasAddons(false);
      return;
    }

    const checkAddons = async () => {
      const { count, error } = await supabase
        .from("cocktail_addons")
        .select("*", { count: "exact", head: true })
        .eq("cocktail_id", cocktailId);

      if (!error && count && count > 0) {
        setHasAddons(true);
      } else {
        setHasAddons(false);
      }
    };

    checkAddons();
  }, [cocktailId, venueId]);

  return hasAddons;
}
