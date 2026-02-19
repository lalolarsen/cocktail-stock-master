import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MixerProduct {
  id: string;
  name: string;
  subcategory: string;
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
 * Fetches mixer products based on subcategory, live from DB.
 * Source of truth: products.subcategory (case-insensitive match).
 *   - "Mixers tradicionales": subcategory ILIKE 'MIXER_TRADICIONAL' OR 'mixers_tradicionales'
 *   - "Redbull":              subcategory ILIKE 'REDBULL'
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

    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        // Fetch all mixer products (tradicionales + redbull) in one query
        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("id, name, subcategory, unit")
          .eq("category", "unidades")
          .not("subcategory", "is", null)
          .order("name");

        if (prodErr) throw prodErr;
        if (cancelled) return;

        const allProducts = products || [];

        // Filter by subcategory (case-insensitive)
        const tradicionalSubcats = ["mixer_tradicional", "mixers_tradicionales"];
        const redbullSubcats = ["redbull"];

        const tradIds = allProducts
          .filter(p => tradicionalSubcats.includes((p.subcategory ?? "").toLowerCase()))
          .map(p => p.id);

        const redbullIds = allProducts
          .filter(p => redbullSubcats.includes((p.subcategory ?? "").toLowerCase()))
          .map(p => p.id);

        const allIds = [...tradIds, ...redbullIds];

        // Fetch stock_balances for these products in the selected location
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
          subcategory: p.subcategory ?? "",
          unit: p.unit ?? "unidad",
          stock: locationId ? (stockMap.get(p.id) ?? 0) : -1,
        });

        setTradicionales(
          allProducts
            .filter(p => tradicionalSubcats.includes((p.subcategory ?? "").toLowerCase()))
            .map(toMixerProduct)
        );
        setRedbull(
          allProducts
            .filter(p => redbullSubcats.includes((p.subcategory ?? "").toLowerCase()))
            .map(toMixerProduct)
        );
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Error cargando mixers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [locationId, venueId]);

  return { tradicionales, redbull, loading, error };
}
