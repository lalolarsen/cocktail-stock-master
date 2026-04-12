import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, fetchAllByIds } from "@/lib/supabase-batch";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { toast } from "sonner";

interface StockMovementWithProduct {
  product_id: string;
  quantity: number | string;
  unit_cost_snapshot: number | null;
  total_cost_snapshot: number | null;
  source_type: string;
  notes?: string | null;
  products: { name: string; cost_per_unit: number | null } | null;
}

interface ManualIncomeRow {
  id: string;
  amount: number | string;
  description: string | null;
  entry_date: string | null;
  created_at: string;
}

export interface CourtesyCOGSItem {
  note: string;
  product_name: string;
  cost: number;
  redeemed_count: number;
}

export interface OpexCategoryBreakdown {
  category: string;
  netTotal: number;
  total: number;
  items: Array<{
    id: string;
    description: string | null;
    expense_date: string;
    net_amount: number;
    total_amount: number;
  }>;
}

export interface WasteBreakdownItem {
  product_name: string;
  quantity: number;
  unit_type: string;
  cost: number;
  reason: string;
}

export interface ManualIncomeEntry {
  id: string;
  amount: number;
  description: string | null;
  entry_date: string;
}

export interface PasslineSessionSummary {
  id: string;
  totem_number: string;
  report_number: string;
  session_date: string;
  total_amount: number;
  net_amount: number;
  iva_amount: number;
  cogs_total: number;
}

export interface FinanceMTD {
  // Sales
  salesGross: number;
  salesNet: number;
  ivaDebito: number;
  salesBruto: number;
  salesNeto: number;
  cogsTotal: number;

  // Courtesy COGS (redeemed only)
  courtesyCogsTotal: number;
  courtesyCogsItems: CourtesyCOGSItem[];

  // Manual income entries
  manualIncomeTotal: number;
  manualIncomeEntries: ManualIncomeEntry[];

  // Passline Totems
  passlineSalesGross: number;
  passlineSalesNet: number;
  passlineIva: number;
  passlineCogs: number;
  passlineMargin: number;
  passlineSessions: PasslineSessionSummary[];

  // Waste
  wasteTotal: number;
  wasteItems: WasteBreakdownItem[];

  // OPEX
  opexTotal: number;
  opexByCategory: OpexCategoryBreakdown[];
  opexDetailSum: number;

  // Results
  grossMargin: number;
  operationalResult: number;
  marginPct: number;
  opexPct: number;

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

  // Legacy compat
  salesTotal: number;
  // Legacy fields kept as 0 for backward compat
  specificTaxTotal: number;
  specificTaxFromInvoices: number;
  specificTaxFromOpex: number;
  specificTaxBreakdown: { iaba_10: number; iaba_18: number; ila_vino: number; ila_cerveza: number; ila_destilados: number };
  ivaCreditoFacturas: number;
  ivaCreditoFromImports: number;
  ivaCreditoTotal: number;
  ivaNeto: number;
  marginPostSpecificTax: number;
  opexVatTotal: number;
  specificTaxForecast: number;

  loading: boolean;
  refresh: () => Promise<void>;
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const now = new Date();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const endDay = isCurrentMonth ? now.getDate() : new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return { start, end };
}

export function useFinanceMTD(year: number, month: number): FinanceMTD {
  const venueId = DEFAULT_VENUE_ID;
  const [salesGross, setSalesGross] = useState(0);
  const [salesNet, setSalesNet] = useState(0);
  const [ivaDebitoState, setIvaDebitoState] = useState(0);
  const [cogsTotal, setCogsTotal] = useState(0);
  const [wasteTotal, setWasteTotal] = useState(0);
  const [wasteItems, setWasteItems] = useState<WasteBreakdownItem[]>([]);
  const [opexByCategory, setOpexByCategory] = useState<OpexCategoryBreakdown[]>([]);
  const [manualIncomeEntries, setManualIncomeEntries] = useState<ManualIncomeEntry[]>([]);
  const [courtesyCogsItems, setCourtesyCogsItems] = useState<CourtesyCOGSItem[]>([]);
  const [passlineSessions, setPasslineSessions] = useState<PasslineSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { start, end } = getMonthRange(year, month);
    const fromISO = `${start}T00:00:00-03:00`;
    const toISO = `${end}T23:59:59-03:00`;

    try {
      const [salesRows, cogsSaleIds, opexRes, manualIncomeRes, passlineRes] = await Promise.all([
        // Sales — paginated
        fetchAllRows(() =>
          supabase
            .from("sales")
            .select("total_amount, net_amount, iva_debit_amount")
            .eq("venue_id", venueId)
            .eq("payment_status", "paid")
            .eq("is_cancelled", false)
            .gte("created_at", fromISO)
            .lte("created_at", toISO)
        ),

        // COGS — sales IDs, paginated
        fetchAllRows<{ id: string }>(() =>
          supabase
            .from("sales")
            .select("id")
            .eq("venue_id", venueId)
            .eq("payment_status", "paid")
            .eq("is_cancelled", false)
            .gte("created_at", fromISO)
            .lte("created_at", toISO)
        ).then(rows => rows.map(s => s.id)),

        // OPEX (manual expenses)
        supabase
          .from("operational_expenses")
          .select("id, category, description, expense_date, amount, net_amount, total_amount")
          .eq("venue_id", venueId)
          .gte("expense_date", start)
          .lte("expense_date", end),

        // Manual gross income entries
        supabase
          .from("gross_income_entries")
          .select("id, amount, description, created_at")
          .eq("venue_id", venueId)
          .eq("source_type", "manual")
          .gte("created_at", `${start}T00:00:00`)
          .lte("created_at", `${end}T23:59:59`),

        // Passline totem sessions
        supabase
          .from("passline_audit_sessions" as never)
          .select("id, totem_number, report_number, session_date, total_amount, net_amount, iva_amount, cogs_total")
          .eq("venue_id", venueId)
          .eq("status", "reconciled")
          .gte("session_date", start)
          .lte("session_date", end),
      ]);

      // ── Sales ── (salesRows already fetched via fetchAllRows)
      let gross = 0, net = 0, ivaD = 0;
      for (const r of salesRows as any[]) {
        const total = Math.abs(Number(r.total_amount || 0));
        const netVal = r.net_amount != null ? Math.abs(Number(r.net_amount)) : Math.round(total / 1.19);
        const ivaVal = r.iva_debit_amount != null ? Math.abs(Number(r.iva_debit_amount)) : total - netVal;
        gross += total;
        net += netVal;
        ivaD += ivaVal;
      }
      setSalesGross(gross);
      setSalesNet(net);
      setIvaDebitoState(ivaD);

      // ── COGS (sales-based: sale_items × recipes × CPP) ──
      let cogs = 0;
      if (cogsSaleIds.length > 0) {
        // Get sale items with cocktail references — paginated
        const saleItems = await fetchAllByIds(
          "sale_items",
          "sale_id",
          cogsSaleIds,
          "quantity, cocktail_id"
        );

        if (saleItems && saleItems.length > 0) {
          // Aggregate qty per cocktail
          const cocktailQty = new Map<string, number>();
          for (const si of saleItems) {
            if (!si.cocktail_id) continue;
            cocktailQty.set(si.cocktail_id, (cocktailQty.get(si.cocktail_id) || 0) + Number(si.quantity));
          }

          const cocktailIds = Array.from(cocktailQty.keys());
          if (cocktailIds.length > 0) {
            // Get recipe ingredients with product costs
            const { data: ingredients } = await supabase
              .from("cocktail_ingredients")
              .select("cocktail_id, product_id, quantity, products:product_id(capacity_ml, cost_per_unit)")
              .in("cocktail_id", cocktailIds);

            for (const ing of ingredients || []) {
              const soldQty = cocktailQty.get(ing.cocktail_id) || 0;
              const ingQtyMl = Number(ing.quantity);
              const capacityMl = Number((ing as any).products?.capacity_ml) || 0;
              const costPerUnit = Number((ing as any).products?.cost_per_unit) || 0;
              const costPerServing = capacityMl > 0
                ? (ingQtyMl / capacityMl) * costPerUnit
                : ingQtyMl * costPerUnit;
              cogs += costPerServing * soldQty;
            }
          }
        }
      }
      setCogsTotal(cogs);

      // ── OPEX ──
      const categoryMap = new Map<string, OpexCategoryBreakdown>();
      for (const row of opexRes.data || []) {
        const cat = row.category || "otros";
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { category: cat, netTotal: 0, total: 0, items: [] });
        }
        const bucket = categoryMap.get(cat)!;
        const netAmt = Math.abs(Number(row.net_amount) || Number(row.amount) || 0);
        const totalAmt = Math.abs(Number(row.total_amount) || netAmt);
        bucket.netTotal += netAmt;
        bucket.total += totalAmt;
        bucket.items.push({
          id: row.id,
          description: row.description,
          expense_date: row.expense_date,
          net_amount: netAmt,
          total_amount: totalAmt,
        });
      }
      setOpexByCategory(Array.from(categoryMap.values()).sort((a, b) => b.total - a.total));

      // ── Waste ──
      const { data: wasteMovements } = await supabase
        .from("stock_movements")
        .select("quantity, unit_cost_snapshot, total_cost_snapshot, product_id, products:product_id(name, cost_per_unit), source_type")
        .eq("venue_id", venueId)
        .eq("movement_type", "waste" as never)
        .eq("source_type", "waste")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);

      const wasteRows = (wasteMovements || []) as unknown as StockMovementWithProduct[];
      let wasteTotalCalc = 0;
      const wasteByProduct = new Map<string, WasteBreakdownItem>();
      for (const row of wasteRows) {
        const productId = row.product_id;
        const productName = row.products?.name ?? "Producto";
        const cpp = Math.abs(Number(row.unit_cost_snapshot ?? row.products?.cost_per_unit ?? 0));
        const qty = Math.abs(Number(row.quantity));
        const rowCost = row.total_cost_snapshot != null
          ? Math.abs(Number(row.total_cost_snapshot))
          : cpp * qty;
        wasteTotalCalc += rowCost;

        const existing = wasteByProduct.get(productId);
        if (existing) {
          existing.quantity += qty;
          existing.cost += rowCost;
        } else {
          const notes = (row.notes as string) ?? "";
          const reasonMatch = notes.match(/\[MERMA APROBADA\] \[([^\]]+)\]/);
          wasteByProduct.set(productId, {
            product_name: productName,
            quantity: qty,
            unit_type: "ml",
            cost: rowCost,
            reason: reasonMatch?.[1] ?? "merma",
          });
        }
      }
      setWasteTotal(wasteTotalCalc);
      setWasteItems(Array.from(wasteByProduct.values()));

      // ── Manual income ──
      const manualRows = (manualIncomeRes.data || []) as unknown as ManualIncomeRow[];
      setManualIncomeEntries(
        manualRows.map((r) => ({
          id: r.id,
          amount: Math.abs(Number(r.amount)),
          description: r.description ?? null,
          entry_date: r.entry_date ?? r.created_at.slice(0, 10),
        }))
      );

      // ── Passline ──
      const passlineRows = (passlineRes.data || []) as unknown as PasslineSessionSummary[];
      setPasslineSessions(passlineRows);

      // ── Courtesy COGS (sales-based) ──
      const { data: courtesyRedemptions } = await supabase
        .from("courtesy_redemptions")
        .select("courtesy_id, venue_id, courtesy_qr:courtesy_id(product_name, note, qty)")
        .eq("venue_id", venueId)
        .eq("result", "success")
        .gte("redeemed_at", fromISO)
        .lte("redeemed_at", toISO);

      const { data: courtesySales } = await supabase
        .from("sales")
        .select("id")
        .eq("venue_id", venueId)
        .eq("sale_category", "courtesy" as never)
        .eq("is_cancelled", false)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);

      let courtesyCogs = 0;
      if (courtesySales && courtesySales.length > 0) {
        const courtesySaleIds = courtesySales.map((s) => s.id);
        const courtesySaleItems = await fetchAllByIds(
          "sale_items",
          "sale_id",
          courtesySaleIds,
          "quantity, cocktail_id"
        );

        if (courtesySaleItems.length > 0) {
          const cCocktailQty = new Map<string, number>();
          for (const si of courtesySaleItems) {
            if (!si.cocktail_id) continue;
            cCocktailQty.set(si.cocktail_id, (cCocktailQty.get(si.cocktail_id) || 0) + Number(si.quantity));
          }
          const cCocktailIds = Array.from(cCocktailQty.keys());
          if (cCocktailIds.length > 0) {
            const { data: cIngredients } = await supabase
              .from("cocktail_ingredients")
              .select("cocktail_id, quantity, products:product_id(capacity_ml, cost_per_unit)")
              .in("cocktail_id", cCocktailIds);

            for (const ing of cIngredients || []) {
              const soldQty = cCocktailQty.get(ing.cocktail_id) || 0;
              const ingQtyMl = Number(ing.quantity);
              const capacityMl = Number((ing as any).products?.capacity_ml) || 0;
              const costPerUnit = Number((ing as any).products?.cost_per_unit) || 0;
              const costPerServing = capacityMl > 0
                ? (ingQtyMl / capacityMl) * costPerUnit
                : ingQtyMl * costPerUnit;
              courtesyCogs += costPerServing * soldQty;
            }
          }
        }
      }

      const courtesyByNote = new Map<string, CourtesyCOGSItem>();
      for (const r of courtesyRedemptions || []) {
        const qr = r.courtesy_qr as any;
        if (!qr) continue;
        const noteKey = qr.note || "Sin motivo";
        const existing = courtesyByNote.get(noteKey);
        if (existing) {
          existing.redeemed_count += 1;
        } else {
          courtesyByNote.set(noteKey, {
            note: noteKey,
            product_name: qr.product_name || "",
            cost: 0,
            redeemed_count: 1,
          });
        }
      }
      const totalRedemptions = Array.from(courtesyByNote.values()).reduce((s, i) => s + i.redeemed_count, 0);
      if (totalRedemptions > 0 && courtesyCogs > 0) {
        for (const item of courtesyByNote.values()) {
          item.cost = (item.redeemed_count / totalRedemptions) * courtesyCogs;
        }
      }
      setCourtesyCogsItems(Array.from(courtesyByNote.values()).sort((a, b) => b.cost - a.cost));

    } catch (err: any) {
      const msg = err?.message || "Error al cargar datos financieros";
      console.error("Error fetching finance MTD:", err);
      setFetchError(msg);
      toast.error(msg, { description: "Revisa tu conexión o recarga la página." });
    } finally {
      setLoading(false);
    }
  }, [venueId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived ──
  const ivaDebito = ivaDebitoState;
  const salesNeto = salesNet;
  const salesBruto = salesGross;
  const manualIncomeTotal = manualIncomeEntries.reduce((s, e) => s + e.amount, 0);
  const courtesyCogsTotal = courtesyCogsItems.reduce((s, i) => s + i.cost, 0);

  const passlineSalesGross = passlineSessions.reduce((s, p) => s + Math.abs(Number(p.total_amount)), 0);
  const passlineSalesNet = passlineSessions.reduce((s, p) => s + Math.abs(Number(p.net_amount) || Math.round(Number(p.total_amount) / 1.19)), 0);
  const passlineIva = passlineSessions.reduce((s, p) => s + Math.abs(Number(p.iva_amount) || (Number(p.total_amount) - Math.round(Number(p.total_amount) / 1.19))), 0);
  const passlineCogs = passlineSessions.reduce((s, p) => s + Math.abs(Number(p.cogs_total) || 0), 0);
  const passlineMargin = passlineSalesNet - passlineCogs;

  const opexDetailSum = opexByCategory.reduce((s, c) => s + c.total, 0);
  const opexTotal = opexDetailSum;

  // Simplified results: Ventas Netas - COGS - Merma - OPEX
  const grossMargin = salesNeto - cogsTotal;
  const operationalResult = grossMargin - wasteTotal - opexTotal;
  const marginPct = salesNeto > 0 ? (grossMargin / salesNeto) * 100 : 0;
  const opexPct = salesNeto > 0 ? (opexTotal / salesNeto) * 100 : 0;

  // Forecast
  const now = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const daysElapsed = isCurrentMonth ? Math.max(now.getDate(), 1) : daysInMonth;
  const factor = isCurrentMonth && daysElapsed > 0 ? daysInMonth / daysElapsed : 1;

  const salesForecast = salesNeto * factor;
  const cogsForecast = cogsTotal * factor;
  const opexForecast = opexTotal * factor;
  const grossProfitForecast = salesForecast - cogsForecast;
  const operatingResultForecast = grossProfitForecast - opexForecast;
  const grossMarginPctForecast = salesForecast > 0 ? (grossProfitForecast / salesForecast) * 100 : 0;
  const opexPctForecast = salesForecast > 0 ? (opexForecast / salesForecast) * 100 : 0;

  return {
    salesGross,
    salesNet,
    salesBruto,
    salesNeto,
    ivaDebito,
    cogsTotal,
    courtesyCogsTotal,
    courtesyCogsItems,
    wasteTotal,
    wasteItems,
    manualIncomeTotal,
    manualIncomeEntries,
    passlineSalesGross,
    passlineSalesNet,
    passlineIva,
    passlineCogs,
    passlineMargin,
    passlineSessions,
    // Legacy compat — all 0
    specificTaxTotal: 0,
    specificTaxFromInvoices: 0,
    specificTaxFromOpex: 0,
    specificTaxBreakdown: { iaba_10: 0, iaba_18: 0, ila_vino: 0, ila_cerveza: 0, ila_destilados: 0 },
    ivaCreditoFacturas: 0,
    ivaCreditoFromImports: 0,
    ivaCreditoTotal: 0,
    ivaNeto: ivaDebito,
    marginPostSpecificTax: grossMargin,
    opexVatTotal: 0,
    specificTaxForecast: 0,
    opexTotal,
    opexByCategory,
    opexDetailSum,
    grossMargin,
    operationalResult,
    marginPct,
    opexPct,
    daysElapsed,
    daysInMonth,
    salesForecast,
    cogsForecast,
    opexForecast,
    grossProfitForecast,
    operatingResultForecast,
    grossMarginPctForecast,
    opexPctForecast,
    salesTotal: salesBruto,
    loading,
    fetchError,
    refresh: fetchData,
  } as any;
}
