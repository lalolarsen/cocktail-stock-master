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
  const centerX = w / 2;
  const safeLeft = 8;
  const safeRight = w - safeLeft;
  const safeWidth = safeRight - safeLeft;
  let y = 8;
  const lh = 4.5; // line height

  const separator = (offset = 0) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(safeLeft, y + offset, safeRight, y + offset);
  };

  const centered = (text: string, yy: number, options: Record<string, unknown> = {}) => {
    doc.text(text, centerX, yy, { align: "center", maxWidth: safeWidth, ...options });
  };

  // Header
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  centered("RESULTADOS JORNADA", y);
  y += lh + 2;

  separator();
  y += lh;

  // Meta
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  centered(data.venueName, y);
  y += lh;
  centered(`Caja: ${data.posName}`, y);
  y += lh;
  centered(`Jornada #${data.jornadaNumber}`, y);
  y += lh;
  centered(data.fecha, y);
  y += lh;

  separator();
  y += lh + 2;

  // Financial summary
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  centered("RESUMEN FINANCIERO", y);
  y += lh + 2;

  separator();
  y += lh;

  const pad = safeLeft;
  const rightX = safeRight;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);

  doc.text(`Efectivo (${data.cashCount})`, pad, y);
  doc.text(formatCLP(data.cashTotal), rightX, y, { align: "right" });
  y += lh;

  doc.text(`Tarjeta (${data.cardCount})`, pad, y);
  doc.text(formatCLP(data.cardTotal), rightX, y, { align: "right" });
  y += lh + 1;

  separator();
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
  separator();
  y += lh + 6;

  // Signature section
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text("Firma cajero:", pad, y);
  y += lh + 8;
  doc.line(safeLeft + 10, y, safeRight - 10, y);
  y += lh + 2;
  doc.text("Nombre:", pad, y);
  y += lh + 4;
  doc.line(safeLeft + 10, y, safeRight - 10, y);
  y += lh + 2;
  doc.text("RUT (opcional):", pad, y);
  y += lh + 4;
  doc.line(safeLeft + 10, y, safeRight - 10, y);
  y += lh + 4;

  doc.setFontSize(7);
  centered(`Generado: ${data.downloadTime}`, y);

  doc.save(`jornada_${data.jornadaNumber}_${data.posName.replace(/\s+/g, "_")}.pdf`);
}
