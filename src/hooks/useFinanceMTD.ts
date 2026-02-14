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

export interface FinanceMTD {
  // Sales
  salesBruto: number;       // with IVA
  salesNeto: number;        // without IVA
  ivaDebito: number;        // IVA from sales
  cogsTotal: number;

  // Specific taxes (ILA/IABA) — separate from COGS
  specificTaxTotal: number;
  specificTaxFromInvoices: number;
  specificTaxFromOpex: number;

  // OPEX
  opexTotal: number;
  opexByCategory: OpexCategoryBreakdown[];
  opexVatTotal: number;     // total IVA from OPEX (manual)

  // IVA crédito from invoices
  ivaCreditoFacturas: number;
  ivaNeto: number;          // debito - credito

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
  const [salesBruto, setSalesBruto] = useState(0);
  const [cogsTotal, setCogsTotal] = useState(0);
  const [opexByCategory, setOpexByCategory] = useState<OpexCategoryBreakdown[]>([]);
  const [ivaCreditoFacturas, setIvaCreditoFacturas] = useState(0);
  const [specificTaxFromInvoices, setSpecificTaxFromInvoices] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getMonthRange(year, month);
    const fromISO = `${start}T00:00:00-03:00`;
    const toISO = `${end}T23:59:59-03:00`;

    try {
      const [salesRes, cogsRes, opexRes, invoiceRes] = await Promise.all([
        // Sales
        supabase
          .from("sales")
          .select("total_amount")
          .eq("venue_id", venueId)
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

        // OPEX (with new columns)
        supabase
          .from("operational_expenses")
          .select("id, category, description, expense_date, amount, net_amount, vat_amount, specific_tax_amount, total_amount")
          .eq("venue_id", venueId)
          .gte("expense_date", start)
          .lte("expense_date", end),

        // IVA crédito + specific tax from invoices
        supabase
          .from("purchase_documents")
          .select("iva_amount, specific_tax_amount")
          .eq("venue_id", venueId)
          .eq("status", "confirmed")
          .gte("document_date", start)
          .lte("document_date", end),
      ]);

      // Sales bruto (con IVA)
      const bruto = (salesRes.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      setSalesBruto(bruto);

      // COGS
      const cogs = (cogsRes.data || []).reduce(
        (s, r) => s + Math.abs(Number(r.quantity)) * (Number(r.unit_cost) || 0),
        0
      );
      setCogsTotal(cogs);

      // OPEX by category
      const categoryMap = new Map<string, OpexCategoryBreakdown>();
      for (const row of opexRes.data || []) {
        const cat = row.category || "otros";
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { category: cat, netTotal: 0, vatTotal: 0, specificTaxTotal: 0, total: 0, items: [] });
        }
        const bucket = categoryMap.get(cat)!;
        const netAmt = Number(row.net_amount) || Number(row.amount) || 0;
        const vatAmt = Number(row.vat_amount) || 0;
        const specAmt = Number(row.specific_tax_amount) || 0;
        const totalAmt = Number(row.total_amount) || netAmt;
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
      setOpexByCategory(Array.from(categoryMap.values()).sort((a, b) => b.total - a.total));

      // IVA crédito + specific tax from invoices
      const invoiceRows = invoiceRes.data || [];
      const credito = invoiceRows.reduce((s, r) => s + Number(r.iva_amount || 0), 0);
      setIvaCreditoFacturas(credito);
      const specTaxInv = invoiceRows.reduce((s, r) => s + Number(r.specific_tax_amount || 0), 0);
      setSpecificTaxFromInvoices(specTaxInv);
    } catch (err) {
      console.error("Error fetching finance MTD:", err);
    } finally {
      setLoading(false);
    }
  }, [venueId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived
  const salesNeto = Math.round(salesBruto / 1.19);
  const ivaDebito = salesBruto - salesNeto;
  const opexTotal = opexByCategory.reduce((s, c) => s + c.total, 0);
  const opexVatTotal = opexByCategory.reduce((s, c) => s + c.vatTotal, 0);
  const specificTaxFromOpex = opexByCategory.reduce((s, c) => s + c.specificTaxTotal, 0);
  const specificTaxTotal = specificTaxFromInvoices + specificTaxFromOpex;
  const ivaNeto = ivaDebito - ivaCreditoFacturas;
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
    salesBruto,
    salesNeto,
    ivaDebito,
    cogsTotal,
    specificTaxTotal,
    specificTaxFromInvoices,
    specificTaxFromOpex,
    opexTotal,
    opexByCategory,
    opexVatTotal,
    ivaCreditoFacturas,
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
