/**
 * Generates a PDF report for a cashier's jornada results (single POS).
 * Uses jsPDF (already installed).
 */
import jsPDF from "jspdf";
import { formatCLP } from "@/lib/currency";
import { calculateCommission, STOCKIA_COMMISSION_RATE } from "@/lib/commission";

export interface CashierReportData {
  venueName: string;
  posName: string;
  jornadaNumber: number;
  fecha: string;
  downloadTime: string;
  cashTotal: number;
  cashCount: number;
  cardTotal: number;
  cardCount: number;
  grandTotal: number;
  grandCount: number;
}

export function downloadCashierReport(data: CashierReportData): void {
  const doc = new jsPDF({ unit: "mm", format: [80, 180] });
  const w = 80;
  let y = 8;
  const lh = 4.5; // line height

  // Header
  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text("RESULTADOS JORNADA", w / 2, y, { align: "center" });
  y += lh + 2;

  doc.setFontSize(8);
  doc.text("================================================", w / 2, y, { align: "center" });
  y += lh;

  // Meta
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(data.venueName, w / 2, y, { align: "center" });
  y += lh;
  doc.text(`Caja: ${data.posName}`, w / 2, y, { align: "center" });
  y += lh;
  doc.text(`Jornada #${data.jornadaNumber}`, w / 2, y, { align: "center" });
  y += lh;
  doc.text(data.fecha, w / 2, y, { align: "center" });
  y += lh;

  doc.setFontSize(8);
  doc.text("================================================", w / 2, y, { align: "center" });
  y += lh + 2;

  // Financial summary
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.text("RESUMEN FINANCIERO", w / 2, y, { align: "center" });
  y += lh + 2;

  doc.setFontSize(8);
  doc.text("------------------------------------------------", w / 2, y, { align: "center" });
  y += lh;

  const pad = 4;
  const rightX = w - pad;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);

  doc.text(`Efectivo (${data.cashCount})`, pad, y);
  doc.text(formatCLP(data.cashTotal), rightX, y, { align: "right" });
  y += lh;

  doc.text(`Tarjeta (${data.cardCount})`, pad, y);
  doc.text(formatCLP(data.cardTotal), rightX, y, { align: "right" });
  y += lh + 1;

  doc.setFontSize(8);
  doc.text("------------------------------------------------", w / 2, y, { align: "center" });
  y += lh;

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(`TOTAL: ${formatCLP(data.grandTotal)}`, rightX, y, { align: "right" });
  y += lh;
  doc.setFontSize(9);
  doc.text(`${data.grandCount} ventas`, rightX, y, { align: "right" });
  y += lh + 2;

  // Comisión STOCKIA (informativa, no descuenta del efectivo a entregar)
  const commission = calculateCommission(data.grandTotal);
  const ratePct = (STOCKIA_COMMISSION_RATE * 100).toFixed(1).replace(/\.0$/, "");
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(`Comisión STOCKIA (${ratePct}%)`, pad, y);
  doc.text(formatCLP(commission), rightX, y, { align: "right" });
  y += lh + 1;

  doc.setFontSize(8);
  doc.text("================================================", w / 2, y, { align: "center" });
  y += lh + 6;

  // Signature section
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text("Firma cajero:", pad, y);
  y += lh + 8;
  doc.text("_________________________", w / 2, y, { align: "center" });
  y += lh + 2;
  doc.text("Nombre:", pad, y);
  y += lh + 4;
  doc.text("_________________________", w / 2, y, { align: "center" });
  y += lh + 2;
  doc.text("RUT (opcional):", pad, y);
  y += lh + 4;
  doc.text("_________________________", w / 2, y, { align: "center" });
  y += lh + 4;

  doc.setFontSize(7);
  doc.text(`Generado: ${data.downloadTime}`, w / 2, y, { align: "center" });

  doc.save(`jornada_${data.jornadaNumber}_${data.posName.replace(/\s+/g, "_")}.pdf`);
}
