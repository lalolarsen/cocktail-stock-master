import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VENUE_ID } from "@/lib/venue";

export interface FinanceMTD {
  salesTotal: number;
  cogsTotal: number;
  grossMargin: number;
  opexTotal: number;
  operationalResult: number;
  opexPct: number;
  marginPct: number;
  // Forecast
  daysElapsed: number;
  daysInMonth: number;
  salesForecast: number;
  cogsForecast: number;
  opexForecast: number;
  grossProfitForecast: number;
  operatingResultForecast: number;
  grossMarginPctForecast: number;
  opexPctForecast: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  // Build dates in America/Santiago context
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function useFinanceMTD(year: number, month: number): FinanceMTD {
  const venueId = DEFAULT_VENUE_ID;
  const [salesTotal, setSalesTotal] = useState(0);
  const [cogsTotal, setCogsTotal] = useState(0);
  const [opexTotal, setOpexTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { start, end } = getMonthRange(year, month);

    // Build ISO timestamps for the range (Santiago ≈ UTC-3/-4)
    const fromISO = `${start}T00:00:00-03:00`;
    const toISO = `${end}T23:59:59-03:00`;

    try {
      const [salesRes, cogsRes, opexRes] = await Promise.all([
        supabase
          .from("sales")
          .select("total_amount")
          .eq("venue_id", venueId)
          .eq("is_cancelled", false)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),

        supabase
          .from("stock_movements")
          .select("quantity, unit_cost")
          .eq("venue_id", venueId)
          .eq("movement_type", "salida")
          .in("source_type", ["sale_redemption", "cover_redemption", "sale", "pickup"])
          .gte("created_at", fromISO)
          .lte("created_at", toISO),

        supabase
          .from("operational_expenses")
          .select("amount")
          .eq("venue_id", venueId)
          .gte("expense_date", start)
          .lte("expense_date", end),
      ]);

      const sales = (salesRes.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      setSalesTotal(sales);

      const cogs = (cogsRes.data || []).reduce(
        (s, r) => s + Math.abs(Number(r.quantity)) * (Number(r.unit_cost) || 0),
        0
      );
      setCogsTotal(cogs);

      const opex = (opexRes.data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      setOpexTotal(opex);
    } catch (err) {
      console.error("Error fetching finance MTD:", err);
    } finally {
      setLoading(false);
    }
  }, [venueId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grossMargin = salesTotal - cogsTotal;
  const operationalResult = grossMargin - opexTotal;
  const opexPct = salesTotal > 0 ? (opexTotal / salesTotal) * 100 : 0;
  const marginPct = salesTotal > 0 ? (grossMargin / salesTotal) * 100 : 0;

  // Forecast
  const now2 = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now2.getDate();
  const daysElapsed = Math.max(today, 1);
  const factor = daysElapsed > 0 ? daysInMonth / daysElapsed : 1;

  const salesForecast = salesTotal * factor;
  const cogsForecast = cogsTotal * factor;
  const opexForecast = opexTotal * factor;
  const grossProfitForecast = salesForecast - cogsForecast;
  const operatingResultForecast = grossProfitForecast - opexForecast;
  const grossMarginPctForecast = salesForecast > 0 ? (grossProfitForecast / salesForecast) * 100 : 0;
  const opexPctForecast = salesForecast > 0 ? (opexForecast / salesForecast) * 100 : 0;

  return {
    salesTotal,
    cogsTotal,
    grossMargin,
    opexTotal,
    operationalResult,
    opexPct,
    marginPct,
    daysElapsed,
    daysInMonth,
    salesForecast,
    cogsForecast,
    opexForecast,
    grossProfitForecast,
    operatingResultForecast,
    grossMarginPctForecast,
    opexPctForecast,
    loading,
    refresh: fetchData,
  };
}
