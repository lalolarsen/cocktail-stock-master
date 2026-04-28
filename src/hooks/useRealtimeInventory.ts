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
  is_totals?: boolean;
}

export interface InventoryTotals {
  totalValue: number;
  productCount: number;
  lowCount: number;
  criticalCount: number;
}

interface UseRealtimeInventoryResult {
  rows: InventorySnapshotRow[];
  totals: InventoryTotals;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
}

// Throttle: max 1 fetch per 2s, debounce 1500ms for burst events
const DEBOUNCE_MS = 1500;
const MIN_INTERVAL_MS = 2000;

function parseTotalsRow(row: InventorySnapshotRow | undefined): InventoryTotals {
  if (!row) return { totalValue: 0, productCount: 0, lowCount: 0, criticalCount: 0 };
  const totalValue = Number(row.stock_value) || 0;
  const status = row.status || "";
  const lowMatch = /count_low=(\d+)/.exec(status);
  const critMatch = /count_critical=(\d+)/.exec(status);
  const prodMatch = /count_products=(\d+)/.exec(status);
  return {
    totalValue,
    productCount: prodMatch ? Number(prodMatch[1]) : 0,
    lowCount: lowMatch ? Number(lowMatch[1]) : 0,
    criticalCount: critMatch ? Number(critMatch[1]) : 0,
  };
}

export function useRealtimeInventory(venueId: string | null | undefined): UseRealtimeInventoryResult {
  const [rows, setRows] = useState<InventorySnapshotRow[]>([]);
  const [totals, setTotals] = useState<InventoryTotals>({
    totalValue: 0, productCount: 0, lowCount: 0, criticalCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastFetchRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const fetchSnapshot = useCallback(async () => {
    if (!venueId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("get_realtime_inventory_snapshot", {
        p_venue_id: venueId,
      });
      if (error) throw error;
      const all = (data ?? []) as InventorySnapshotRow[];
      const totalsRow = all.find((r) => r.is_totals);
      const dataRows = all.filter((r) => !r.is_totals);
      setRows(dataRows);
      setTotals(parseTotalsRow(totalsRow));
      setLastUpdate(new Date());
      lastFetchRef.current = Date.now();
    } catch (e: any) {
      setError(e?.message ?? "Error cargando inventario");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [venueId]);

  // Throttled + debounced revalidation triggered by realtime events
  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const elapsed = Date.now() - lastFetchRef.current;
    const delay = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - elapsed);
    debounceRef.current = window.setTimeout(() => {
      void fetchSnapshot();
    }, delay);
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!venueId) return;
    void fetchSnapshot();

    const channel = supabase
      .channel(`realtime-inventory-${venueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_balances", filter: `venue_id=eq.${venueId}` },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stock_movements", filter: `venue_id=eq.${venueId}` },
        () => scheduleRefresh()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [venueId, fetchSnapshot, scheduleRefresh]);

  return useMemo(
    () => ({ rows, totals, loading, error, lastUpdate, refresh: fetchSnapshot }),
    [rows, totals, loading, error, lastUpdate, fetchSnapshot]
  );
}
