import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabase-batch";

const TZ = "America/Santiago";

function monthRangeUTC(year: number, month0: number): { startISO: string; endISO: string; days: number } {
  // month0 is 0-indexed. Build first/last day in America/Santiago, then convert to ISO UTC.
  const first = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const last = new Date(Date.UTC(year, month0 + 1, 1, 0, 0, 0));
  // Approximate: range filter by ISO range works for created_at timestamps.
  // For document_date (DATE), we'll use YYYY-MM-DD bounds.
  return {
    startISO: first.toISOString(),
    endISO: last.toISOString(),
    days: new Date(year, month0 + 1, 0).getDate(),
  };
}

function ymd(year: number, month0: number, day: number) {
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export interface TopProductRow {
  product_id: string | null;
  name: string;
  units: number;
  amount: number;
  lastUnitCost: number;
}

export interface DailyPoint {
  day: string; // "01", "02", ...
  comprado: number;
  vendido: number;
}

export interface ComprasMetricsResult {
  loading: boolean;
  error: string | null;
  totalComprado: number;
  totalVendido: number;
  ratioPct: number;
  daily: DailyPoint[];
  topProducts: TopProductRow[];
  refresh: () => void;
}

export function useComprasMetrics(
  venueId: string | null | undefined,
  year: number,
  month0: number
): ComprasMetricsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalComprado, setTotalComprado] = useState(0);
  const [totalVendido, setTotalVendido] = useState(0);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { startISO, endISO, days } = monthRangeUTC(year, month0);
        const startDate = ymd(year, month0, 1);
        const endDate = ymd(year, month0, days);

        // Compras CONFIRMED del mes (por document_date, fallback created_at)
        const imports = await fetchAllRows<any>(() =>
          supabase
            .from("purchase_imports")
            .select("id, document_date, total_amount, created_at, status")
            .eq("venue_id", venueId)
            .eq("status", "CONFIRMED")
            .gte("document_date", startDate)
            .lte("document_date", endDate)
        );

        // Ventas del mes
        const sales = await fetchAllRows<any>(() =>
          supabase
            .from("sales")
            .select("id, total_amount, created_at, is_cancelled")
            .eq("venue_id", venueId)
            .eq("is_cancelled", false)
            .gte("created_at", startISO)
            .lt("created_at", endISO)
        );

        // Líneas de compras del mes (top productos)
        const importIds = imports.map((i) => i.id);
        let lines: any[] = [];
        if (importIds.length > 0) {
          // Batches of 200 to be safe with .in()
          for (let i = 0; i < importIds.length; i += 200) {
            const batch = importIds.slice(i, i + 200);
            const part = await fetchAllRows<any>(() =>
              supabase
                .from("purchase_import_lines")
                .select("product_id, units_real, cost_unit_net, line_total_net, raw_text, purchase_import_id")
                .in("purchase_import_id", batch)
                .eq("classification", "inventory")
            );
            lines.push(...part);
          }
        }

        // Resolve product names
        const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
        const productMap = new Map<string, string>();
        if (productIds.length > 0) {
          for (let i = 0; i < productIds.length; i += 200) {
            const batch = productIds.slice(i, i + 200);
            const { data: prods } = await supabase
              .from("products")
              .select("id, name")
              .in("id", batch);
            (prods || []).forEach((p: any) => productMap.set(p.id, p.name));
          }
        }

        // Aggregates
        const tComprado = Math.round(
          imports.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
        );
        const tVendido = Math.round(
          sales.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
        );

        // Daily breakdown
        const map = new Map<string, DailyPoint>();
        for (let d = 1; d <= days; d++) {
          const key = String(d).padStart(2, "0");
          map.set(key, { day: key, comprado: 0, vendido: 0 });
        }
        for (const imp of imports) {
          const dateStr: string | null = imp.document_date || imp.created_at?.slice(0, 10);
          if (!dateStr) continue;
          const d = dateStr.slice(8, 10);
          const row = map.get(d);
          if (row) row.comprado += Number(imp.total_amount) || 0;
        }
        for (const s of sales) {
          // Convert created_at to America/Santiago day
          const d = new Date(s.created_at).toLocaleDateString("en-CA", {
            timeZone: TZ,
          }); // YYYY-MM-DD
          const day = d.slice(8, 10);
          const row = map.get(day);
          if (row) row.vendido += Number(s.total_amount) || 0;
        }
        const dailyArr = Array.from(map.values()).map((r) => ({
          day: r.day,
          comprado: Math.round(r.comprado),
          vendido: Math.round(r.vendido),
        }));

        // Top products
        const topMap = new Map<string, TopProductRow>();
        for (const l of lines) {
          const pid = l.product_id || `__raw__${l.raw_text || "desconocido"}`;
          const name = l.product_id
            ? productMap.get(l.product_id) || "(producto eliminado)"
            : (l.raw_text || "Sin identificar").toString().slice(0, 60);
          const existing = topMap.get(pid);
          const units = Number(l.units_real) || 0;
          const amount = Number(l.line_total_net) || units * (Number(l.cost_unit_net) || 0);
          const unitCost = Number(l.cost_unit_net) || 0;
          if (existing) {
            existing.units += units;
            existing.amount += amount;
            existing.lastUnitCost = unitCost || existing.lastUnitCost;
          } else {
            topMap.set(pid, {
              product_id: l.product_id || null,
              name,
              units,
              amount,
              lastUnitCost: unitCost,
            });
          }
        }
        const top = Array.from(topMap.values())
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 20)
          .map((r) => ({
            ...r,
            units: Math.round(r.units * 100) / 100,
            amount: Math.round(r.amount),
            lastUnitCost: Math.round(r.lastUnitCost),
          }));

        if (cancelled) return;
        setTotalComprado(tComprado);
        setTotalVendido(tVendido);
        setDaily(dailyArr);
        setTopProducts(top);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error cargando métricas");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [venueId, year, month0, tick]);

  const ratioPct = useMemo(() => {
    if (totalVendido <= 0) return 0;
    return Math.round((totalComprado / totalVendido) * 1000) / 10;
  }, [totalComprado, totalVendido]);

  return {
    loading,
    error,
    totalComprado,
    totalVendido,
    ratioPct,
    daily,
    topProducts,
    refresh,
  };
}
