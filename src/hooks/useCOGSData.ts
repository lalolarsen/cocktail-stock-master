import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, format } from "date-fns";

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

  const fetchData = async () => {
    setLoading(true);

    try {
      const fromTimestamp = dateRange?.from
        ? startOfDay(dateRange.from).toISOString()
        : startOfDay(new Date()).toISOString();
      const toTimestamp = dateRange?.to
        ? endOfDay(dateRange.to).toISOString()
        : endOfDay(new Date()).toISOString();

      // Fetch stock movements with costs
      let query = supabase
        .from("stock_movements")
        .select(`
          id,
          product_id,
          quantity,
          unit_cost,
          source_type,
          pickup_token_id,
          created_at,
          products!inner (
            name,
            category,
            subcategory,
            unit,
            capacity_ml,
            cost_per_unit
          )
        `)
        .eq("movement_type", "salida")
        .in("source_type", ["sale_redemption", "cover_redemption", "sale", "pickup"])
        .gte("created_at", fromTimestamp)
        .lte("created_at", toTimestamp);

      if (jornadaId) {
        query = query.eq("jornada_id", jornadaId);
      }

      const { data: movements, error } = await query;

      if (error) {
        console.error("Error fetching COGS data:", error);
        return;
      }

      // If no stock movements (e.g. inventory freeze mode), estimate COGS from recipes
      if (!movements || movements.length === 0) {
        if (jornadaId) {
          await fetchEstimatedCOGS(jornadaId);
        } else {
          setSummary({
            total_cogs: 0,
            total_items: 0,
            products_count: 0,
            avg_cost_per_redemption: 0,
            redemptions_count: 0,
          });
          setByProduct([]);
          setByCategory([]);
          setByCocktail([]);
        }
        return;
      }

      // Calculate summary
      const uniqueProducts = new Set<string>();
      const uniqueTokens = new Set<string>();
      let totalCogs = 0;
      let totalItems = 0;

      // Group by product
      const productMap = new Map<string, COGSByProduct>();
      // Group by category
      const categoryMap = new Map<string, { total_cost: number; products: Set<string>; items: number }>();

      movements.forEach((m: any) => {
        const qty = Math.abs(Number(m.quantity));
        const capacityMl = Number(m.products?.capacity_ml) || 0;
      // Fallback: if unit_cost on movement is missing, use product catalog cost
      const rawUnitCost = Number(m.unit_cost) || 0;
      const catalogCost = Number(m.products?.cost_per_unit) || 0;
      const unitCost = rawUnitCost > 0 ? rawUnitCost : catalogCost;

        // Regla determinística:
        //   BOTELLA (capacity_ml > 0): quantity en ml, unit_cost por botella
        //     → costo = (qty_ml / capacity_ml) * unit_cost
        //   UNITARIO: costo = qty * unit_cost
        const cost = capacityMl > 0
          ? (qty / capacityMl) * unitCost
          : qty * unitCost;

        totalCogs += cost;
        totalItems++;
        uniqueProducts.add(m.product_id);
        if (m.pickup_token_id) uniqueTokens.add(m.pickup_token_id);

        const productName = m.products?.name || "Unknown";
        const category = m.products?.category || "otros";
        const subcategory = m.products?.subcategory || null;
        const unit = m.products?.unit || "u";

        // Aggregate by product
        // Para botellas: expresar quantity en botellas equivalentes para la UI
        const displayQty = capacityMl > 0 ? qty / capacityMl : qty;
        const existing = productMap.get(m.product_id);
        if (existing) {
          existing.total_quantity += displayQty;
          existing.total_cost += cost;
        } else {
          productMap.set(m.product_id, {
            product_id: m.product_id,
            product_name: productName,
            category,
            subcategory,
            total_quantity: displayQty,
            unit: capacityMl > 0 ? "bot." : unit,
            unit_cost: unitCost,
            total_cost: cost,
          });
        }


        // Aggregate by category
        const catData = categoryMap.get(category);
        if (catData) {
          catData.total_cost += cost;
          catData.products.add(m.product_id);
          catData.items++;
        } else {
          categoryMap.set(category, {
            total_cost: cost,
            products: new Set([m.product_id]),
            items: 1,
          });
        }
      });

      // Convert maps to arrays
      const productArray = Array.from(productMap.values()).sort((a, b) => b.total_cost - a.total_cost);
      const categoryArray = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        total_cost: data.total_cost,
        product_count: data.products.size,
        items_count: data.items,
      })).sort((a, b) => b.total_cost - a.total_cost);

      // Fetch cocktail-level data using pickup tokens
      let cocktailData: COGSByCocktail[] = [];
      if (uniqueTokens.size > 0) {
        const tokenIds = Array.from(uniqueTokens);
        const { data: tokens } = await supabase
          .from("pickup_tokens")
          .select(`
            id,
            source_type,
            sale_id,
            cover_cocktail_id,
            cocktails:cover_cocktail_id (name)
          `)
          .in("id", tokenIds.slice(0, 100)); // Limit for performance

        if (tokens) {
          const cocktailMap = new Map<string, { count: number; cost: number }>();
          
          // Get cocktails from sale_items for sale-based tokens
          const saleIds = tokens.filter(t => t.sale_id).map(t => t.sale_id);
          if (saleIds.length > 0) {
            const { data: saleItems } = await supabase
              .from("sale_items")
              .select(`
                sale_id,
                quantity,
                cocktails (name)
              `)
              .in("sale_id", saleIds.slice(0, 100));

            saleItems?.forEach((si: any) => {
              const name = si.cocktails?.name || "Unknown";
              const existing = cocktailMap.get(name);
              if (existing) {
                existing.count += Number(si.quantity);
              } else {
                cocktailMap.set(name, { count: Number(si.quantity), cost: 0 });
              }
            });
          }

          // Add cover cocktails
          tokens.forEach((t: any) => {
            if (t.source_type === "ticket" && t.cocktails?.name) {
              const name = t.cocktails.name;
              const existing = cocktailMap.get(name);
              if (existing) {
                existing.count += 1;
              } else {
                cocktailMap.set(name, { count: 1, cost: 0 });
              }
            }
          });

          // Calculate costs per cocktail (approximation based on total)
          cocktailData = Array.from(cocktailMap.entries()).map(([name, data]) => ({
            cocktail_name: name,
            redemptions_count: data.count,
            total_cost: 0, // Will be calculated based on recipe
            avg_cost_per_unit: 0,
          }));
        }
      }

      setSummary({
        total_cogs: totalCogs,
        total_items: totalItems,
        products_count: uniqueProducts.size,
        avg_cost_per_redemption: uniqueTokens.size > 0 ? totalCogs / uniqueTokens.size : 0,
        redemptions_count: uniqueTokens.size,
      });
      setByProduct(productArray);
      setByCategory(categoryArray);
      setByCocktail(cocktailData);
    } catch (error) {
      console.error("Error in useCOGSData:", error);
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
