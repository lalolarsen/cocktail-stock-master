import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VENUE_ID } from "@/lib/venue";

export interface OpexCategoryBreakdown {
  category: string;
  netTotal: number;
  vatTotal: number;
  specificTaxTotal: number;
  total: number;
  items: Array<{
    id: string;
    description: string | null;
    expense_date: string;
    net_amount: number;
    vat_amount: number;
    specific_tax_amount: number;
    total_amount: number;
  }>;
}

export interface SpecificTaxBreakdown {
  iaba_10: number;
  iaba_18: number;
  ila_vino: number;
  ila_cerveza: number;
  ila_destilados: number;
}

export interface FinanceMTD {
  // Sales
  salesGross: number;
  salesNet: number;
  ivaDebito: number;
  salesBruto: number;
  salesNeto: number;
  cogsTotal: number;

  // Specific taxes (ILA/IABA) — separate block
  specificTaxTotal: number;
  specificTaxFromInvoices: number;
  specificTaxFromOpex: number;
  specificTaxBreakdown: SpecificTaxBreakdown;

  // OPEX (single source, includes freight)
  opexTotal: number;
  opexByCategory: OpexCategoryBreakdown[];
  opexVatTotal: number;
  /** Sum of opexByCategory totals — used for validation */
  opexDetailSum: number;

  // IVA crédito
  ivaCreditoFacturas: number;
  ivaCreditoFromImports: number;
  ivaCreditoTotal: number;
  ivaNeto: number;

  // Results
  grossMargin: number;
  marginPostSpecificTax: number;
  operationalResult: number;
  marginPct: number;
  opexPct: number;

  // Forecast
  daysElapsed: number;
  daysInMonth: number;
  salesForecast: number;
  cogsForecast: number;
  specificTaxForecast: number;
  opexForecast: number;
  grossProfitForecast: number;
  operatingResultForecast: number;
  grossMarginPctForecast: number;
  opexPctForecast: number;

  // Legacy compat
  salesTotal: number;

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
  const [opexByCategory, setOpexByCategory] = useState<OpexCategoryBreakdown[]>([]);
  const [ivaCreditoFacturas, setIvaCreditoFacturas] = useState(0);
  const [ivaCreditoFromImports, setIvaCreditoFromImports] = useState(0);
  const [specificTaxFromInvoices, setSpecificTaxFromInvoices] = useState(0);
  const [specificTaxBreakdown, setSpecificTaxBreakdown] = useState<SpecificTaxBreakdown>({
    iaba_10: 0, iaba_18: 0, ila_vino: 0, ila_cerveza: 0, ila_destilados: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getMonthRange(year, month);
    const fromISO = `${start}T00:00:00-03:00`;
    const toISO = `${end}T23:59:59-03:00`;

    try {
      const [salesRes, cogsRes, opexRes, invoiceRes, importsRes] = await Promise.all([
        // Sales — read columns directly
        supabase
          .from("sales")
          .select("total_amount, net_amount, iva_debit_amount")
          .eq("venue_id", venueId)
          .eq("payment_status", "paid")
          .eq("is_cancelled", false)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),

        // COGS
        supabase
          .from("stock_movements")
          .select("quantity, unit_cost")
          .eq("venue_id", venueId)
          .eq("movement_type", "salida")
          .in("source_type", ["sale_redemption", "cover_redemption", "sale", "pickup"])
          .gte("created_at", fromISO)
          .lte("created_at", toISO),

        // OPEX (manual expenses)
        supabase
          .from("operational_expenses")
          .select("id, category, description, expense_date, amount, net_amount, vat_amount, specific_tax_amount, total_amount")
          .eq("venue_id", venueId)
          .gte("expense_date", start)
          .lte("expense_date", end),

        // IVA crédito + specific tax from purchase_documents (legacy)
        supabase
          .from("purchase_documents")
          .select("iva_amount, specific_tax_amount")
          .eq("venue_id", venueId)
          .eq("status", "confirmed")
          .gte("document_date", start)
          .lte("document_date", end),

        // Confirmed purchase_imports — IVA, specific taxes, freight
        supabase
          .from("purchase_imports" as any)
          .select("vat_amount, iaba_10_total, iaba_18_total, ila_vino_total, ila_cerveza_total, ila_destilados_total, specific_taxes_total, financial_summary")
          .eq("venue_id", venueId)
          .eq("status", "CONFIRMED")
          .gte("document_date", start)
          .lte("document_date", end),
      ]);

      // ── Sales with fallback ──
      const salesRows = salesRes.data || [];
      let gross = 0, net = 0, ivaD = 0;
      for (const r of salesRows) {
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

      // ── COGS (abs to normalize) ──
      const cogs = (cogsRes.data || []).reduce(
        (s, r) => s + Math.abs(Number(r.quantity)) * Math.abs(Number(r.unit_cost) || 0),
        0,
      );
      setCogsTotal(cogs);

      // ── OPEX by category (from operational_expenses) ──
      const categoryMap = new Map<string, OpexCategoryBreakdown>();
      for (const row of opexRes.data || []) {
        const cat = row.category || "otros";
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { category: cat, netTotal: 0, vatTotal: 0, specificTaxTotal: 0, total: 0, items: [] });
        }
        const bucket = categoryMap.get(cat)!;
        const netAmt = Math.abs(Number(row.net_amount) || Number(row.amount) || 0);
        const vatAmt = Math.abs(Number(row.vat_amount) || 0);
        const specAmt = Math.abs(Number(row.specific_tax_amount) || 0);
        const totalAmt = Math.abs(Number(row.total_amount) || netAmt);
        bucket.netTotal += netAmt;
        bucket.vatTotal += vatAmt;
        bucket.specificTaxTotal += specAmt;
        bucket.total += totalAmt;
        bucket.items.push({
          id: row.id,
          description: row.description,
          expense_date: row.expense_date,
          net_amount: netAmt,
          vat_amount: vatAmt,
          specific_tax_amount: specAmt,
          total_amount: totalAmt,
        });
      }

      // ── IVA crédito + specific tax from purchase_documents (legacy) ──
      const invoiceRows = invoiceRes.data || [];
      const creditoLegacy = invoiceRows.reduce((s, r) => s + Math.abs(Number(r.iva_amount || 0)), 0);
      setIvaCreditoFacturas(creditoLegacy);
      const specTaxLegacy = invoiceRows.reduce((s, r) => s + Math.abs(Number(r.specific_tax_amount || 0)), 0);

      // ── From confirmed purchase_imports ──
      const importRows = (importsRes.data || []) as any[];
      const creditoImports = importRows.reduce((s: number, r: any) => s + Math.abs(Number(r.vat_amount || 0)), 0);
      setIvaCreditoFromImports(creditoImports);

      // Specific taxes by category
      const breakdown: SpecificTaxBreakdown = { iaba_10: 0, iaba_18: 0, ila_vino: 0, ila_cerveza: 0, ila_destilados: 0 };
      let specTaxImports = 0;
      let freightTotal = 0;
      for (const r of importRows) {
        breakdown.iaba_10 += Math.abs(Number(r.iaba_10_total || 0));
        breakdown.iaba_18 += Math.abs(Number(r.iaba_18_total || 0));
        breakdown.ila_vino += Math.abs(Number(r.ila_vino_total || 0));
        breakdown.ila_cerveza += Math.abs(Number(r.ila_cerveza_total || 0));
        breakdown.ila_destilados += Math.abs(Number(r.ila_destilados_total || 0));
        specTaxImports += Math.abs(Number(r.specific_taxes_total || 0));
        // Extract freight from financial_summary
        const fs = r.financial_summary as any;
        if (fs?.operational_expenses?.freight_total) {
          freightTotal += Math.abs(fs.operational_expenses.freight_total);
        }
      }
      setSpecificTaxBreakdown(breakdown);
      setSpecificTaxFromInvoices(specTaxLegacy + specTaxImports);

      // ── Integrate freight into OPEX as "transporte" category ──
      if (freightTotal > 0) {
        const freightCat = "transporte";
        if (!categoryMap.has(freightCat)) {
          categoryMap.set(freightCat, { category: freightCat, netTotal: 0, vatTotal: 0, specificTaxTotal: 0, total: 0, items: [] });
        }
        const bucket = categoryMap.get(freightCat)!;
        bucket.netTotal += freightTotal;
        bucket.total += freightTotal;
        bucket.items.push({
          id: `freight-imports-${start}`,
          description: "Flete/Transporte (facturas importadas)",
          expense_date: start,
          net_amount: freightTotal,
          vat_amount: 0,
          specific_tax_amount: 0,
          total_amount: freightTotal,
        });
      }

      setOpexByCategory(Array.from(categoryMap.values()).sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error("Error fetching finance MTD:", err);
    } finally {
      setLoading(false);
    }
  }, [venueId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived (all positive internally, signs applied in UI) ──
  const ivaDebito = ivaDebitoState;
  const salesNeto = salesNet;
  const salesBruto = salesGross;

  // OPEX total = sum of all category totals (single source, no separate freight)
  const opexDetailSum = opexByCategory.reduce((s, c) => s + c.total, 0);
  const opexTotal = opexDetailSum;
  const opexVatTotal = opexByCategory.reduce((s, c) => s + c.vatTotal, 0);

  const specificTaxFromOpex = opexByCategory.reduce((s, c) => s + c.specificTaxTotal, 0);
  const specificTaxTotal = specificTaxFromInvoices + specificTaxFromOpex;
  const ivaCreditoTotal = ivaCreditoFacturas + ivaCreditoFromImports;
  const ivaNeto = ivaDebito - ivaCreditoTotal;

  // Results — all positive values, subtracted once
  const grossMargin = salesNeto - cogsTotal;
  const marginPostSpecificTax = grossMargin - specificTaxTotal;
  const operationalResult = marginPostSpecificTax - opexTotal;
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
  const specificTaxForecast = specificTaxTotal * factor;
  const opexForecast = opexTotal * factor;
  const grossProfitForecast = salesForecast - cogsForecast;
  const operatingResultForecast = (grossProfitForecast - specificTaxForecast) - opexForecast;
  const grossMarginPctForecast = salesForecast > 0 ? (grossProfitForecast / salesForecast) * 100 : 0;
  const opexPctForecast = salesForecast > 0 ? (opexForecast / salesForecast) * 100 : 0;

  return {
    salesGross,
    salesNet,
    salesBruto,
    salesNeto,
    ivaDebito,
    cogsTotal,
    specificTaxTotal,
    specificTaxFromInvoices,
    specificTaxFromOpex,
    specificTaxBreakdown,
    opexTotal,
    opexByCategory,
    opexVatTotal,
    opexDetailSum,
    ivaCreditoFacturas,
    ivaCreditoFromImports,
    ivaCreditoTotal,
    ivaNeto,
    grossMargin,
    marginPostSpecificTax,
    operationalResult,
    marginPct,
    opexPct,
    daysElapsed,
    daysInMonth,
    salesForecast,
    cogsForecast,
    specificTaxForecast,
    opexForecast,
    grossProfitForecast,
    operatingResultForecast,
    grossMarginPctForecast,
    opexPctForecast,
    salesTotal: salesBruto,
    loading,
    refresh: fetchData,
  };
}
