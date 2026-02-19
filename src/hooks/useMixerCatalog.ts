import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MixerProduct {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number; // stock in locationId, or -1 if unknown
}

export interface MixerCatalog {
  tradicionales: MixerProduct[];
  redbull: MixerProduct[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches mixer products based on CATEGORY (source of truth), live from DB.
 *
 * Source of truth: products.category (case-insensitive match).
 *   - "Mixers tradicionales": category ILIKE 'mixers_tradicionales' | 'mixers tradicionales'
 *   - "Redbull":              category ILIKE 'redbull' | 'mixers_redbull'
 *
 * Stock is pulled from stock_balances for the given locationId.
 * If locationId is empty, stock is shown as -1 (unknown).
 */
export function useMixerCatalog(locationId: string, venueId: string): MixerCatalog {
  const [tradicionales, setTradicionales] = useState<MixerProduct[]>([]);
  const [redbull, setRedbull] = useState<MixerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch ALL products from mixer categories (case-insensitive done client-side)
        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("id, name, category, subcategory, unit")
          .order("name");

        if (prodErr) throw prodErr;
        if (cancelled) return;

        const allProducts = products || [];

        // ── Category matching (source of truth) ──────────────────────────────
        const normalise = (s: string | null | undefined) =>
          (s ?? "").trim().toLowerCase().replace(/\s+/g, "_");

        const TRAD_CATS  = new Set(["mixers_tradicionales", "mixer_tradicional"]);
        const RBULL_CATS = new Set(["redbull", "mixers_redbull"]);

        const tradProducts  = allProducts.filter(p => TRAD_CATS.has(normalise(p.category)));
        const redbullProducts = allProducts.filter(p => RBULL_CATS.has(normalise(p.category)));

        const allIds = [...tradProducts, ...redbullProducts].map(p => p.id);

        // ── Stock balances for selected location ──────────────────────────────
        let stockMap = new Map<string, number>();
        if (locationId && allIds.length > 0) {
          const { data: balances } = await supabase
            .from("stock_balances")
            .select("product_id, quantity")
            .in("product_id", allIds)
            .eq("location_id", locationId);

          if (!cancelled && balances) {
            balances.forEach(b => {
              const cur = stockMap.get(b.product_id) ?? 0;
              stockMap.set(b.product_id, cur + (Number(b.quantity) || 0));
            });
          }
        }

        if (cancelled) return;

        const toMixerProduct = (p: typeof allProducts[number]): MixerProduct => ({
          id: p.id,
          name: p.name,
          category: p.category ?? "",
          unit: p.unit ?? "unidad",
          stock: locationId ? (stockMap.get(p.id) ?? 0) : -1,
        });

        setTradicionales(tradProducts.map(toMixerProduct));
        setRedbull(redbullProducts.map(toMixerProduct));
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Error cargando mixers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [locationId, venueId]);

  return { tradicionales, redbull, loading, error };
}
