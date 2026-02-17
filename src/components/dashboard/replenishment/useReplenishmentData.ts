import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PILOT_VENUE_ID } from "@/lib/venue";
import type { StockLocation, ReplenishmentProduct, TransferHistoryRow } from "./types";

export function useReplenishmentData() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  const [balances, setBalances] = useState<{ product_id: string; location_id: string; quantity: number }[]>([]);
  const [history, setHistory] = useState<TransferHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const warehouse = useMemo(() => locations.find((l) => l.type === "warehouse"), [locations]);
  const barLocations = useMemo(() => locations.filter((l) => l.type === "bar" && l.is_active !== false), [locations]);

  const fetchData = useCallback(async () => {
    try {
      const [locRes, prodRes, balRes, histRes] = await Promise.all([
        supabase.from("stock_locations").select("id, name, type, is_active")
          .eq("venue_id", PILOT_VENUE_ID)
          .order("type", { ascending: false }).order("name"),
        supabase.from("products").select("id, name, code, category, unit, cost_per_unit, capacity_ml")
          .eq("venue_id", PILOT_VENUE_ID)
          .order("name"),
        supabase.from("stock_balances").select("product_id, location_id, quantity")
          .eq("venue_id", PILOT_VENUE_ID),
        supabase.from("stock_movements")
          .select("id, created_at, quantity, unit_cost_snapshot, total_cost_snapshot, notes, from_location_id, to_location_id, product_id, source_type")
          .eq("venue_id", PILOT_VENUE_ID)
          .in("movement_type", ["transfer_out", "salida"])
          .eq("source_type", "replenishment")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (locRes.error) throw locRes.error;
      if (prodRes.error) throw prodRes.error;
      if (balRes.error) throw balRes.error;

      setLocations((locRes.data || []) as StockLocation[]);
      setRawProducts(prodRes.data || []);
      setBalances(balRes.data || []);

      // Build history with product names and location names
      const locs = (locRes.data || []) as StockLocation[];
      const prods = prodRes.data || [];
      const locMap = new Map(locs.map(l => [l.id, l.name]));
      const prodMap = new Map(prods.map(p => [p.id, p]));

      const historyRows: TransferHistoryRow[] = (histRes.data || []).map((m: any) => {
        const prod = prodMap.get(m.product_id);
        return {
          id: m.id,
          created_at: m.created_at,
          product_name: prod?.name || "Desconocido",
          product_unit: prod?.unit || "ud",
          quantity: Number(m.quantity),
          unit_cost: m.unit_cost_snapshot ? Number(m.unit_cost_snapshot) : null,
          total_cost: m.total_cost_snapshot ? Number(m.total_cost_snapshot) : null,
          from_location: locMap.get(m.from_location_id) || "—",
          to_location: locMap.get(m.to_location_id) || "—",
          notes: m.notes,
          capacity_ml: prod?.capacity_ml || null,
        };
      });
      setHistory(historyRows);
    } catch (error) {
      console.error("Error fetching replenishment data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build enriched products
  const getBalance = useCallback((productId: string, locationId: string) => {
    return balances.find(b => b.product_id === productId && b.location_id === locationId)?.quantity || 0;
  }, [balances]);

  const products: ReplenishmentProduct[] = useMemo(() => {
    if (!warehouse) return [];
    return rawProducts.map(p => {
      const wStock = getBalance(p.id, warehouse.id);
      const isVolumetric = p.unit === "ml" && !!p.capacity_ml;
      const costPerUnit = Number(p.cost_per_unit) || 0;
      // For volumetric: cost_per_unit = bottle cost, unitCost = cost per ml
      // For unitario: cost_per_unit = per unit
      const unitCost = isVolumetric && p.capacity_ml > 0
        ? costPerUnit / p.capacity_ml
        : costPerUnit;

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        category: p.category,
        unit: p.unit,
        cost_per_unit: costPerUnit,
        capacity_ml: p.capacity_ml,
        warehouseStock: wStock,
        barStock: 0, // set per bar when needed
        unitCost,
        isVolumetric,
      };
    });
  }, [rawProducts, warehouse, getBalance]);

  // Metrics: stock distribution
  const metrics = useMemo(() => {
    let warehouseCost = 0;
    let barsCost = 0;
    let warehouseQty = 0;
    let barsQty = 0;

    for (const p of rawProducts) {
      const costPerUnit = Number(p.cost_per_unit) || 0;
      for (const b of balances) {
        if (b.product_id !== p.id) continue;
        const loc = locations.find(l => l.id === b.location_id);
        if (!loc) continue;
        const qty = Number(b.quantity) || 0;
        const val = qty * costPerUnit;
        if (loc.type === "warehouse") {
          warehouseCost += val;
          warehouseQty += qty;
        } else {
          barsCost += val;
          barsQty += qty;
        }
      }
    }
    const total = warehouseCost + barsCost;
    return {
      warehouseCost,
      barsCost,
      totalCost: total,
      warehousePct: total > 0 ? (warehouseCost / total) * 100 : 0,
      barsPct: total > 0 ? (barsCost / total) * 100 : 0,
    };
  }, [rawProducts, balances, locations]);

  return {
    warehouse,
    barLocations,
    products,
    getBalance,
    history,
    metrics,
    loading,
    refetch: fetchData,
  };
}
