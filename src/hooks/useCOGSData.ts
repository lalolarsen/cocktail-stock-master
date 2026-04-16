import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase-batch";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay } from "date-fns";

export interface COGSByProduct {
  product_id: string;
  product_name: string;
  category: string;
  subcategory: string | null;
  total_quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
}

export interface COGSByCategory {
  category: string;
  total_cost: number;
  product_count: number;
  items_count: number;
}

export interface COGSByCocktail {
  cocktail_name: string;
  redemptions_count: number;
  total_cost: number;
  avg_cost_per_unit: number;
}

export interface COGSSummary {
  total_cogs: number;
  total_items: number;
  products_count: number;
  avg_cost_per_redemption: number;
  redemptions_count: number;
}

interface UseCOGSDataResult {
  summary: COGSSummary;
  byProduct: COGSByProduct[];
  byCategory: COGSByCategory[];
  byCocktail: COGSByCocktail[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * COGS based on SALES: sale_items × cocktail recipes × product CPP.
 * No longer depends on stock_movements / redeem.
 */
export function useCOGSData(dateRange?: DateRange, jornadaId?: string): UseCOGSDataResult {
  const [summary, setSummary] = useState<COGSSummary>({
    total_cogs: 0,
    total_items: 0,
    products_count: 0,
    avg_cost_per_redemption: 0,
    redemptions_count: 0,
  });
  const [byProduct, setByProduct] = useState<COGSByProduct[]>([]);
  const [byCategory, setByCategory] = useState<COGSByCategory[]>([]);
  const [byCocktail, setByCocktail] = useState<COGSByCocktail[]>([]);
  const [loading, setLoading] = useState(true);

  const resetState = () => {
    setSummary({ total_cogs: 0, total_items: 0, products_count: 0, avg_cost_per_redemption: 0, redemptions_count: 0 });
    setByProduct([]);
    setByCategory([]);
    setByCocktail([]);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const fromTimestamp = dateRange?.from
        ? startOfDay(dateRange.from).toISOString()
        : startOfDay(new Date()).toISOString();
      const toTimestamp = dateRange?.to
        ? endOfDay(dateRange.to).toISOString()
        : endOfDay(new Date()).toISOString();

      // 1. Get paid, non-cancelled sales (paginated to avoid 1000-row cap)
      const sales = await fetchAllRows<{ id: string }>(() => {
        let query: any = supabase
          .from("sales")
          .select("id")
          .eq("venue_id", DEFAULT_VENUE_ID)
          .eq("payment_status", "paid")
          .eq("is_cancelled", false)
          .gte("created_at", fromTimestamp)
          .lte("created_at", toTimestamp);

        if (jornadaId) {
          query = query.eq("jornada_id", jornadaId);
        }

        return query;
      });

      const saleIds = sales.map((sale) => sale.id);
      if (saleIds.length === 0) {
        resetState();
        return;
      }

      // 2. Get sale items with cocktail info (batched to avoid long URLs)
      const saleItems = await fetchAllByIds<any>(
        "sale_items",
        "sale_id",
        saleIds,
        "quantity, cocktail_id, cocktails(id, name)"
      );

      if (!saleItems || saleItems.length === 0) {
        resetState();
        return;
      }

      // 3. Aggregate cocktail quantities sold
      const cocktailQty = new Map<string, { name: string; qty: number }>();
      saleItems.forEach((si: any) => {
        const c = si.cocktails as { id: string; name: string } | null;
        if (!c) return;
        const existing = cocktailQty.get(c.id);
        if (existing) {
          existing.qty += Number(si.quantity);
        } else {
          cocktailQty.set(c.id, { name: c.name, qty: Number(si.quantity) });
        }
      });

      const cocktailIds = Array.from(cocktailQty.keys());
      if (cocktailIds.length === 0) {
        resetState();
        return;
      }

      // 4. Get recipe ingredients with product costs (CPP)
      const ingredients = await fetchAllByIds<any>(
        "cocktail_ingredients",
        "cocktail_id",
        cocktailIds,
        "cocktail_id, product_id, quantity, products(name, category, subcategory, unit, cost_per_unit, capacity_ml)"
      );

      if (!ingredients) {
        resetState();
        return;
      }

      // 5. Calculate COGS: recipe cost × sold quantity
      let totalCogs = 0;
      const productMap = new Map<string, COGSByProduct>();
      const categoryMap = new Map<string, { total_cost: number; products: Set<string>; items: number }>();
      const cocktailCosts: COGSByCocktail[] = [];
      const uniqueProducts = new Set<string>();
      let totalItems = 0;

      cocktailIds.forEach(cocktailId => {
        const recipeIngredients = ingredients.filter(i => i.cocktail_id === cocktailId);
        const soldQty = cocktailQty.get(cocktailId)?.qty || 0;
        const cocktailName = cocktailQty.get(cocktailId)?.name || "Unknown";
        let recipeCost = 0;

        recipeIngredients.forEach((ing: any) => {
          const p = ing.products;
          if (!p || !ing.product_id) return;
          const ingQtyMl = Number(ing.quantity); // ml per serving
          const capacityMl = Number(p.capacity_ml) || 0;
          const costPerUnit = Number(p.cost_per_unit) || 0; // CPP

          // Cost of this ingredient per serving
          const costPerServing = capacityMl > 0
            ? (ingQtyMl / capacityMl) * costPerUnit
            : ingQtyMl * costPerUnit;

          const totalIngCost = costPerServing * soldQty;
          recipeCost += costPerServing;
          totalCogs += totalIngCost;
          totalItems += soldQty;
          uniqueProducts.add(ing.product_id);

          // By product
          const displayQty = capacityMl > 0 ? (ingQtyMl * soldQty) / capacityMl : ingQtyMl * soldQty;
          const existing = productMap.get(ing.product_id);
          if (existing) {
            existing.total_quantity += displayQty;
            existing.total_cost += totalIngCost;
          } else {
            productMap.set(ing.product_id, {
              product_id: ing.product_id,
              product_name: p.name,
              category: p.category || "otros",
              subcategory: p.subcategory || null,
              total_quantity: displayQty,
              unit: capacityMl > 0 ? "bot." : (p.unit || "u"),
              unit_cost: costPerUnit,
              total_cost: totalIngCost,
            });
          }

          // By category
          const cat = p.category || "otros";
          const catData = categoryMap.get(cat);
          if (catData) {
            catData.total_cost += totalIngCost;
            catData.products.add(ing.product_id);
            catData.items += soldQty;
          } else {
            categoryMap.set(cat, { total_cost: totalIngCost, products: new Set([ing.product_id]), items: soldQty });
          }
        });

        cocktailCosts.push({
          cocktail_name: cocktailName,
          redemptions_count: soldQty,
          total_cost: recipeCost * soldQty,
          avg_cost_per_unit: recipeCost,
        });
      });

      const totalSold = Array.from(cocktailQty.values()).reduce((s, c) => s + c.qty, 0);

      setSummary({
        total_cogs: totalCogs,
        total_items: totalItems,
        products_count: uniqueProducts.size,
        avg_cost_per_redemption: totalSold > 0 ? totalCogs / totalSold : 0,
        redemptions_count: totalSold,
      });
      setByProduct(Array.from(productMap.values()).sort((a, b) => b.total_cost - a.total_cost));
      setByCategory(
        Array.from(categoryMap.entries())
          .map(([category, data]) => ({
            category,
            total_cost: data.total_cost,
            product_count: data.products.size,
            items_count: data.items,
          }))
          .sort((a, b) => b.total_cost - a.total_cost)
      );
      setByCocktail(cocktailCosts.sort((a, b) => b.total_cost - a.total_cost));
    } catch (err) {
      console.error("Error calculating COGS from sales:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange?.from, dateRange?.to, jornadaId]);

  return {
    summary,
    byProduct,
    byCategory,
    byCocktail,
    loading,
    refresh: fetchData,
  };
}
