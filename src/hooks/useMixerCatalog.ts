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
  latas: MixerProduct[];
  loading: boolean;
  error: string | null;
  /** @deprecated kept for legacy compat */
  tradicionales: MixerProduct[];
  /** @deprecated kept for legacy compat */
  redbull: MixerProduct[];
}

/**
 * Fetches mixer products from the unified "latas_redbull" category.
 * Also matches legacy categories for backward compatibility.
 */
export function useMixerCatalog(locationId: string, venueId: string): MixerCatalog {
  const [latas, setLatas] = useState<MixerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("id, name, category, subcategory, unit")
          .eq("venue_id", venueId)
          .eq("is_active_in_sales", true)
          .order("name");

        if (prodErr) throw prodErr;
        if (cancelled) return;

        const allProducts = products || [];

        const normalise = (s: string | null | undefined) =>
          (s ?? "").trim().toLowerCase().replace(/\s+/g, "_");

        const MIXER_CATS = new Set([
          "latas_redbull",
          "mixers_tradicionales",
          "mixer_tradicional",
          "redbull",
          "mixers_redbull",
        ]);

        const mixerProducts = allProducts.filter(p => MIXER_CATS.has(normalise(p.category)));

        const allIds = mixerProducts.map(p => p.id);

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

        setLatas(mixerProducts.map(toMixerProduct));
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Error cargando mixers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [locationId, venueId]);

  // Legacy compat: both point to latas
  return { latas, tradicionales: latas, redbull: [], loading, error };
}
