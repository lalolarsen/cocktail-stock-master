import { supabase } from "@/integrations/supabase/client";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase-batch";

type PaymentBucket = "cash" | "card" | "other";

interface SalesRow {
  id: string;
  pos_id: string | null;
  sale_number: string | null;
  created_at: string;
  total_amount: number;
  payment_method: string | null;
  is_cancelled: boolean;
  payment_status: string | null;
  sale_category: string | null;
  seller_id: string | null;
  point_of_sale?: string | null;
}

interface TicketSalesRow {
  id: string;
  pos_id: string | null;
  ticket_number: string | null;
  created_at: string;
  total: number;
  payment_method: string | null;
  payment_status: string | null;
  sold_by_worker_id: string | null;
}

interface PosTerminalRow {
  id: string;
  name: string;
  pos_type: string | null;
}

export interface JornadaLiveTotals {
  grossSalesTotal: number;
  netSalesTotal: number;
  transactionsCount: number;
  cancelledSalesTotal: number;
  cancelledTransactionsCount: number;
  alcoholSalesTotal: number;
  ticketSalesTotal: number;
  cashSales: number;
  cardSales: number;
  otherSales: number;
  productsSold: number;
}

export interface JornadaLivePOSummary extends JornadaLiveTotals {
  posId: string | null;
  posName: string;
  posType: string | null;
}

export interface JornadaCombinedSaleDetail {
  id: string;
  source: "alcohol" | "ticket";
  saleNumber: string;
  createdAt: string;
  totalAmount: number;
  pointOfSale: string;
  paymentMethod: string;
  sellerId: string | null;
  saleCategory: string;
  isCancelled: boolean;
}

export interface JornadaLiveReport {
  overall: JornadaLiveTotals;
  perPos: JornadaLivePOSummary[];
  combinedSales: JornadaCombinedSaleDetail[];
}

const createEmptyTotals = (): JornadaLiveTotals => ({
  grossSalesTotal: 0,
  netSalesTotal: 0,
  transactionsCount: 0,
  cancelledSalesTotal: 0,
  cancelledTransactionsCount: 0,
  alcoholSalesTotal: 0,
  ticketSalesTotal: 0,
  cashSales: 0,
  cardSales: 0,
  otherSales: 0,
  productsSold: 0,
});

const normalizePaymentBucket = (paymentMethod?: string | null): PaymentBucket => {
  if (paymentMethod === "cash") return "cash";
  if (paymentMethod === "card") return "card";
  return "other";
};

const addPaymentAmount = (target: JornadaLiveTotals, paymentMethod: string | null | undefined, amount: number) => {
  const bucket = normalizePaymentBucket(paymentMethod);
  if (bucket === "cash") target.cashSales += amount;
  else if (bucket === "card") target.cardSales += amount;
  else target.otherSales += amount;
};

export async function fetchJornadaLiveReport(jornadaId: string): Promise<JornadaLiveReport> {
  const [salesRows, ticketSalesRows, posRes] = await Promise.all([
    fetchAllRows<SalesRow>(() =>
      supabase
        .from("sales")
        .select("id, pos_id, sale_number, created_at, total_amount, payment_method, is_cancelled, payment_status, sale_category, seller_id, point_of_sale")
        .eq("jornada_id", jornadaId)
    ),
    fetchAllRows<TicketSalesRow>(() =>
      supabase
        .from("ticket_sales")
        .select("id, pos_id, ticket_number, created_at, total, payment_method, payment_status, sold_by_worker_id")
        .eq("jornada_id", jornadaId)
    ),
    supabase.from("pos_terminals").select("id, name, pos_type"),
  ]);

  if (posRes.error) throw posRes.error;

  const overall = createEmptyTotals();
  const posMap = new Map((posRes.data as PosTerminalRow[] | null || []).map((pos) => [pos.id, pos]));
  const perPosMap = new Map<string, JornadaLivePOSummary>();
  const combinedSales: JornadaCombinedSaleDetail[] = [];
  const saleToPosMap = new Map<string, string>();
  const ticketSaleToPosMap = new Map<string, string>();

  const ensurePosSummary = (posId: string | null, fallbackName: string, fallbackType: string | null): JornadaLivePOSummary => {
    const key = posId || `unknown:${fallbackName}`;
    if (!perPosMap.has(key)) {
      perPosMap.set(key, {
        ...createEmptyTotals(),
        posId,
        posName: posId ? posMap.get(posId)?.name || fallbackName : fallbackName,
        posType: posId ? posMap.get(posId)?.pos_type || fallbackType : fallbackType,
      });
    }
    return perPosMap.get(key)!;
  };

  const activeSales = salesRows.filter((sale) => !sale.is_cancelled && (sale.payment_status ?? "paid") === "paid");
  const cancelledSales = salesRows.filter((sale) => sale.is_cancelled);
  const paidTicketSales = ticketSalesRows.filter((sale) => (sale.payment_status ?? "paid") === "paid");

  activeSales.forEach((sale) => {
    const amount = Number(sale.total_amount || 0);
    const posSummary = ensurePosSummary(sale.pos_id, sale.point_of_sale || "Sin POS", "alcohol_sales");
    overall.grossSalesTotal += amount;
    overall.netSalesTotal += amount;
    overall.alcoholSalesTotal += amount;
    overall.transactionsCount += 1;
    addPaymentAmount(overall, sale.payment_method, amount);

    posSummary.grossSalesTotal += amount;
    posSummary.netSalesTotal += amount;
    posSummary.alcoholSalesTotal += amount;
    posSummary.transactionsCount += 1;
    addPaymentAmount(posSummary, sale.payment_method, amount);

    const posKey = sale.pos_id || `unknown:${posSummary.posName}`;
    saleToPosMap.set(sale.id, posKey);
    combinedSales.push({
      id: sale.id,
      source: "alcohol",
      saleNumber: sale.sale_number || sale.id.slice(0, 8),
      createdAt: sale.created_at,
      totalAmount: amount,
      pointOfSale: posSummary.posName,
      paymentMethod: sale.payment_method || "cash",
      sellerId: sale.seller_id,
      saleCategory: sale.sale_category || "alcohol",
      isCancelled: false,
    });
  });

  cancelledSales.forEach((sale) => {
    const amount = Number(sale.total_amount || 0);
    overall.cancelledSalesTotal += amount;
    overall.cancelledTransactionsCount += 1;
  });

  paidTicketSales.forEach((sale) => {
    const amount = Number(sale.total || 0);
    const posSummary = ensurePosSummary(sale.pos_id, "Caja Tickets", "ticket_sales");
    overall.grossSalesTotal += amount;
    overall.netSalesTotal += amount;
    overall.ticketSalesTotal += amount;
    overall.transactionsCount += 1;
    addPaymentAmount(overall, sale.payment_method, amount);

    posSummary.grossSalesTotal += amount;
    posSummary.netSalesTotal += amount;
    posSummary.ticketSalesTotal += amount;
    posSummary.transactionsCount += 1;
    addPaymentAmount(posSummary, sale.payment_method, amount);

    const posKey = sale.pos_id || `unknown:${posSummary.posName}`;
    ticketSaleToPosMap.set(sale.id, posKey);
    combinedSales.push({
      id: sale.id,
      source: "ticket",
      saleNumber: sale.ticket_number || sale.id.slice(0, 8),
      createdAt: sale.created_at,
      totalAmount: amount,
      pointOfSale: posSummary.posName,
      paymentMethod: sale.payment_method || "cash",
      sellerId: sale.sold_by_worker_id,
      saleCategory: "ticket",
      isCancelled: false,
    });
  });

  const [saleItems, ticketItems] = await Promise.all([
    activeSales.length
      ? fetchAllByIds<{ sale_id: string; quantity: number }>("sale_items", "sale_id", activeSales.map((sale) => sale.id), "sale_id, quantity")
      : Promise.resolve([]),
    paidTicketSales.length
      ? fetchAllByIds<{ ticket_sale_id: string; quantity: number }>("ticket_sale_items", "ticket_sale_id", paidTicketSales.map((sale) => sale.id), "ticket_sale_id, quantity")
      : Promise.resolve([]),
  ]);

  saleItems.forEach((item) => {
    const quantity = Number(item.quantity || 0);
    overall.productsSold += quantity;
    const posKey = saleToPosMap.get(item.sale_id);
    if (posKey && perPosMap.has(posKey)) {
      perPosMap.get(posKey)!.productsSold += quantity;
    }
  });

  ticketItems.forEach((item) => {
    const quantity = Number(item.quantity || 0);
    overall.productsSold += quantity;
    const posKey = ticketSaleToPosMap.get(item.ticket_sale_id);
    if (posKey && perPosMap.has(posKey)) {
      perPosMap.get(posKey)!.productsSold += quantity;
    }
  });

  return {
    overall,
    perPos: Array.from(perPosMap.values()).sort((a, b) => b.grossSalesTotal - a.grossSalesTotal),
    combinedSales: combinedSales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}