import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OpenBottle {
  id: string;
  venue_id: string;
  location_id: string;
  product_id: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  opened_by_user_id: string;
  label_code: string | null;
  initial_ml: number;
  remaining_ml: number;
  last_counted_ml: number | null;
  last_counted_at: string | null;
  notes: string | null;
  // Joined
  product_name?: string;
  location_name?: string;
}

export interface BottleCheckResult {
  product_id: string;
  product_name: string;
  required_ml: number;
  available_ml: number;
  sufficient: boolean;
  open_bottles: OpenBottle[];
}

/**
 * Hook para manejar botellas abiertas por ubicación.
 * Se usa en /bar y POS híbrido para control de ml.
 */
export function useOpenBottles(venueId: string, locationId: string | null) {
  const [bottles, setBottles] = useState<OpenBottle[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBottles = useCallback(async () => {
    if (!venueId || !locationId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("open_bottles" as any)
        .select(`
          *,
          products:product_id(name),
          stock_locations:location_id(name)
        `)
        .eq("venue_id", venueId)
        .eq("location_id", locationId)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: true });

      setBottles(
        (data || []).map((r: any) => ({
          ...r,
          product_name: r.products?.name,
          location_name: r.stock_locations?.name,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [venueId, locationId]);

  useEffect(() => {
    fetchBottles();
  }, [fetchBottles]);

  /**
   * Verifica si hay suficiente ml en botellas abiertas para una lista de ingredientes
   */
  const checkBottlesForIngredients = useCallback(
    (
      ingredients: Array<{ product_id: string; product_name: string; required_ml: number }>
    ): BottleCheckResult[] => {
      return ingredients.map((ing) => {
        const openForProduct = bottles.filter(
          (b) => b.product_id === ing.product_id && b.status === "OPEN"
        );
        const available_ml = openForProduct.reduce((s, b) => s + b.remaining_ml, 0);
        return {
          product_id: ing.product_id,
          product_name: ing.product_name,
          required_ml: ing.required_ml,
          available_ml,
          sufficient: available_ml >= ing.required_ml,
          open_bottles: openForProduct,
        };
      });
    },
    [bottles]
  );

  /**
   * Abre una nueva botella en la ubicación actual.
   * Valida que exista al menos 1 unidad en stock_balances antes de registrar.
   */
  const openBottle = useCallback(
    async (params: {
      productId: string;
      initialMl: number;
      labelCode?: string;
      notes?: string;
      actorUserId: string;
    }) => {
      if (!venueId || !locationId) throw new Error("Venue o ubicación no definidos");

      // Validar stock disponible (≥ 1 unidad) antes de abrir
      const { data: balance } = await supabase
        .from("stock_balances")
        .select("quantity")
        .eq("location_id", locationId)
        .eq("product_id", params.productId)
        .maybeSingle();

      const availableUnits = Number(balance?.quantity ?? 0);
      if (availableUnits < 1) {
        throw new Error("Sin stock para abrir esta botella. Reponer primero.");
      }

      const { data: bottle, error } = await (supabase as any)
        .from("open_bottles")
        .insert({
          venue_id: venueId,
          location_id: locationId,
          product_id: params.productId,
          status: "OPEN",
          opened_by_user_id: params.actorUserId,
          label_code: params.labelCode || null,
          initial_ml: params.initialMl,
          remaining_ml: params.initialMl,
          notes: params.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Log OPENED event
      await (supabase as any).from("open_bottle_events").insert({
        open_bottle_id: bottle.id,
        event_type: "OPENED",
        delta_ml: params.initialMl,
        before_ml: 0,
        after_ml: params.initialMl,
        actor_user_id: params.actorUserId,
        reason: "Nueva botella abierta",
      });

      await fetchBottles();
      return bottle as OpenBottle;
    },
    [venueId, locationId, fetchBottles]
  );

  /**
   * Descuenta ml de botellas abiertas FIFO usando la función de BD
   */
  const deductMl = useCallback(
    async (params: {
      productId: string;
      mlToDeduct: number;
      actorUserId: string;
      tokenId?: string;
      reason?: string;
    }) => {
      if (!venueId || !locationId) throw new Error("Venue o ubicación no definidos");

      const { data, error } = await supabase.rpc("deduct_open_bottles" as any, {
        p_location_id: locationId,
        p_product_id: params.productId,
        p_venue_id: venueId,
        p_ml_to_deduct: params.mlToDeduct,
        p_actor_user_id: params.actorUserId,
        p_token_id: params.tokenId || null,
        p_reason: params.reason || "Canje QR",
      });

      if (error) throw error;

      await fetchBottles();
      return data as { success: boolean; deducted_ml: number; missing_ml: number; bottles_used: any[] };
    },
    [venueId, locationId, fetchBottles]
  );

  return {
    bottles,
    loading,
    fetchBottles,
    checkBottlesForIngredients,
    openBottle,
    deductMl,
  };
}
