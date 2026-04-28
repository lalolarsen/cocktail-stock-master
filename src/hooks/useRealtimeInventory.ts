import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InventorySnapshotRow {
  product_id: string;
  product_name: string;
  sku_base: string | null;
  category: string | null;
  capacity_ml: number | null;
  is_bottle: boolean;
  location_id: string;
  location_name: string;
  location_type: string | null;
  quantity: number;
  cpp: number;
  stock_value: number;
  min_quantity: number;
  status: "ok" | "low" | "critical";
  last_movement_at: string | null;
}

interface UseRealtimeInventoryResult {
  rows: InventorySnapshotRow[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
}

export function useRealtimeInventory(venueId: string | null | undefined): UseRealtimeInventoryResult {
  const [rows, setRows] = useState<InventorySnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const debounceRef = useRef<number | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!venueId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("get_realtime_inventory_snapshot", {
        p_venue_id: venueId,
      });
      if (error) throw error;
      setRows((data ?? []) as InventorySnapshotRow[]);
      setLastUpdate(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Error cargando inventario");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  // Debounced revalidation triggered by realtime events
  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSnapshot();
    }, 600);
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!venueId) return;
    void fetchSnapshot();

    const channel = supabase
      .channel(`realtime-inventory-${venueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_balances",
          filter: `venue_id=eq.${venueId}`,
        },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stock_movements",
          filter: `venue_id=eq.${venueId}`,
        },
        () => scheduleRefresh()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [venueId, fetchSnapshot, scheduleRefresh]);

  return useMemo(
    () => ({ rows, loading, error, lastUpdate, refresh: fetchSnapshot }),
    [rows, loading, error, lastUpdate, fetchSnapshot]
  );
}
