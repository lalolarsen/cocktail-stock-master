/**
 * Reporte de productos vendidos por caja (PDF, plantilla unificada).
 */
import { addKpis, addSignature, addTable, createReport, finishReport, reportFileName } from "./pdf-template";

export interface ProductSaleRow {
  cocktailName: string;
  category: string;
  quantity: number;
}

export interface POSProductBreakdown {
  posName: string;
  products: ProductSaleRow[];
  totalUnits: number;
}

export interface ProductSalesReportData {
  jornadaNumber: number;
  fecha: string;
  horario: string;
  venueName?: string;
  posSections: POSProductBreakdown[];
  grandTotalUnits: number;
}

export function generateProductSalesPDF(data: ProductSalesReportData): void {
  const ctx = createReport({ title: "Productos vendidos", jornadaNumber: data.jornadaNumber, fecha: data.fecha, horario: data.horario });
  const all = new Map<string, number>();
  data.posSections.forEach((p) => p.products.forEach((r) => all.set(r.cocktailName, (all.get(r.cocktailName) || 0) + r.quantity)));
  addKpis(ctx, [
    { label: "Unidades", value: String(data.grandTotalUnits) },
    { label: "Productos distintos", value: String(all.size) },
    { label: "Cajas", value: String(data.posSections.length) },
  ]);
  addTable(ctx, "Total por producto", ["Producto", "Unidades"],
    [...all.entries()].sort((a, b) => b[1] - a[1]), { rightCols: [1], foot: ["Total", data.grandTotalUnits] });
  data.posSections.forEach((p) =>
    addTable(ctx, p.posName, ["Producto", "Unidades"],
      p.products.map((r) => [r.cocktailName, r.quantity]), { rightCols: [1], foot: ["Total", p.totalUnits] }));
  addSignature(ctx, "Responsable");
  finishReport(ctx, reportFileName(data.jornadaNumber, "productos"));
}
