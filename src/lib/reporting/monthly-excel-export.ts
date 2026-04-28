import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { calculateCommission, STOCKIA_COMMISSION_RATE } from "@/lib/commission";

export interface MonthlyJornadaRow {
  jornada_id: string;
  numero_jornada: number;
  nombre: string | null;
  fecha: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
  total_sales: number;
  sales_count: number;
  cancelled_total: number;
  cancelled_count: number;
  alcohol_sales: number;
  ticket_sales: number;
  cash_sales: number;
  card_sales: number;
  other_payments: number;
  cogs_total: number | null;
  margin_pct: number | null;
}

export interface MonthlyExportSale {
  jornada_numero: number;
  fecha: string;
  sale_number: string;
  hora: string;
  vendedor: string;
  pos: string;
  categoria: string;
  pago: string;
  total: number;
  estado: string;
}

export function generateMonthlyExcelReport(opts: {
  monthLabel: string;
  jornadas: MonthlyJornadaRow[];
  sales?: MonthlyExportSale[];
}) {
  const { monthLabel, jornadas, sales = [] } = opts;
  const wb = XLSX.utils.book_new();

  // Tab 1: Resumen
  const totalSales = jornadas.reduce((s, j) => s + j.total_sales, 0);
  const totalCancelled = jornadas.reduce((s, j) => s + j.cancelled_total, 0);
  const totalCash = jornadas.reduce((s, j) => s + j.cash_sales, 0);
  const totalCard = jornadas.reduce((s, j) => s + j.card_sales, 0);
  const totalCogs = jornadas.reduce((s, j) => s + (j.cogs_total || 0), 0);
  const margenPct = totalSales > 0 ? ((totalSales - totalCogs) / totalSales) * 100 : 0;

  const resumen = [
    ["Reporte mensual STOCKIA", monthLabel],
    [],
    ["Métrica", "Valor"],
    ["Jornadas", jornadas.length],
    ["Ventas brutas (CLP)", Math.round(totalSales)],
    ["Ventas en efectivo", Math.round(totalCash)],
    ["Ventas con tarjeta", Math.round(totalCard)],
    ["Cancelaciones", Math.round(totalCancelled)],
    ["COGS", Math.round(totalCogs)],
    ["Margen bruto %", margenPct.toFixed(2)],
    [],
    ["Comisión STOCKIA", ""],
    [`Tasa (${(STOCKIA_COMMISSION_RATE * 100).toFixed(1)}%)`, Math.round(calculateCommission(totalSales))],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 32 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  // Tab 2: Jornadas
  const jornadaHeaders = [
    "N°", "Nombre", "Fecha", "Apertura", "Cierre", "Estado",
    "Total ventas", "Transacciones", "Alcohol", "Tickets",
    "Efectivo", "Tarjeta", "Otros", "Cancelaciones", "N° canceladas",
    "COGS", "Margen %",
  ];
  const jornadaRows = jornadas.map((j) => [
    j.numero_jornada,
    j.nombre || `Jornada ${j.numero_jornada}`,
    j.fecha,
    j.hora_apertura?.slice(0, 5) || "",
    j.hora_cierre?.slice(0, 5) || "",
    j.estado,
    Math.round(j.total_sales),
    j.sales_count,
    Math.round(j.alcohol_sales),
    Math.round(j.ticket_sales),
    Math.round(j.cash_sales),
    Math.round(j.card_sales),
    Math.round(j.other_payments),
    Math.round(j.cancelled_total),
    j.cancelled_count,
    Math.round(j.cogs_total || 0),
    j.margin_pct != null ? Number(j.margin_pct.toFixed(2)) : "",
  ]);
  const wsJornadas = XLSX.utils.aoa_to_sheet([jornadaHeaders, ...jornadaRows]);
  wsJornadas["!cols"] = jornadaHeaders.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, wsJornadas, "Jornadas");

  // Tab 3: Ventas detalladas (si vienen)
  if (sales.length > 0) {
    const salesHeaders = ["Jornada", "Fecha", "N° Venta", "Hora", "Vendedor", "POS", "Categoría", "Pago", "Total", "Estado"];
    const salesRows = sales.map((s) => [
      s.jornada_numero, s.fecha, s.sale_number, s.hora, s.vendedor, s.pos, s.categoria, s.pago, Math.round(s.total), s.estado,
    ]);
    const wsSales = XLSX.utils.aoa_to_sheet([salesHeaders, ...salesRows]);
    wsSales["!cols"] = salesHeaders.map(() => ({ wch: 14 }));
    XLSX.utils.book_append_sheet(wb, wsSales, "Ventas");
  }

  const filename = `reporte_${monthLabel.replace(/\s+/g, "_").toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, filename);
}
