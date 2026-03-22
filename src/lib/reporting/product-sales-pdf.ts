/**
 * Generates a downloadable PDF report of products sold per POS terminal
 * for a given jornada. Shows quantities SOLD (not redeemed).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCLP } from "@/lib/currency";

export interface ProductSaleRow {
  cocktailName: string;
  category: string;
  quantity: number;
  revenue: number;
}

export interface POSProductBreakdown {
  posName: string;
  products: ProductSaleRow[];
  totalUnits: number;
  totalRevenue: number;
}

export interface ProductSalesReportData {
  jornadaNumber: number;
  fecha: string;
  horario: string;
  venueName?: string;
  posSections: POSProductBreakdown[];
  grandTotalUnits: number;
  grandTotalRevenue: number;
}

const GREEN_PRIMARY: [number, number, number] = [0, 200, 100];
const DARK_BG: [number, number, number] = [20, 20, 20];
const DARK_CARD: [number, number, number] = [35, 35, 35];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY_LIGHT: [number, number, number] = [160, 160, 160];

export function generateProductSalesPDF(data: ProductSalesReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentW = pageW - marginX * 2;
  let y = 0;

  // ── Background ──
  const drawBackground = () => {
    doc.setFillColor(...DARK_BG);
    doc.rect(0, 0, pageW, pageH, "F");
  };

  drawBackground();

  // ── Header ──
  y = 18;
  doc.setFillColor(...GREEN_PRIMARY);
  doc.roundedRect(marginX, y - 6, contentW, 28, 3, 3, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("REPORTE DE PRODUCTOS VENDIDOS", pageW / 2, y + 4, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Jornada #${data.jornadaNumber}  •  ${data.fecha}  •  ${data.horario}`, pageW / 2, y + 14, { align: "center" });

  y += 32;

  // ── Grand Summary Card ──
  doc.setFillColor(...DARK_CARD);
  doc.roundedRect(marginX, y, contentW, 18, 2, 2, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMEN GENERAL", marginX + 6, y + 7);

  doc.setFontSize(14);
  doc.text(`${data.grandTotalUnits} unidades`, marginX + 6, y + 14);

  doc.setTextColor(...GREEN_PRIMARY);
  doc.text(formatCLP(data.grandTotalRevenue), pageW - marginX - 6, y + 14, { align: "right" });

  y += 24;

  // ── POS Sections ──
  for (const pos of data.posSections) {
    // Check if we need a new page (header + at least a few rows)
    if (y > pageH - 60) {
      doc.addPage();
      drawBackground();
      y = 15;
    }

    // POS Header
    doc.setFillColor(0, 200, 100, 0.15);
    doc.setFillColor(30, 50, 40);
    doc.roundedRect(marginX, y, contentW, 12, 2, 2, "F");

    doc.setTextColor(...GREEN_PRIMARY);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(pos.posName, marginX + 5, y + 8);

    doc.setTextColor(...GRAY_LIGHT);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`${pos.totalUnits} uds  •  ${formatCLP(pos.totalRevenue)}`, pageW - marginX - 5, y + 8, { align: "right" });

    y += 15;

    // Product table
    const tableData = pos.products.map((p) => [
      p.cocktailName,
      p.category,
      p.quantity.toString(),
      formatCLP(p.revenue),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Categoría", "Cant.", "Ingreso"]],
      body: tableData,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: {
        fontSize: 11,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        textColor: WHITE,
        fillColor: DARK_BG,
        lineWidth: 0,
      },
      headStyles: {
        fillColor: DARK_CARD,
        textColor: GRAY_LIGHT,
        fontSize: 9,
        fontStyle: "bold",
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      columnStyles: {
        0: { cellWidth: "auto", fontStyle: "bold" },
        1: { cellWidth: 30, textColor: GRAY_LIGHT, fontSize: 9 },
        2: { cellWidth: 18, halign: "center", textColor: GREEN_PRIMARY, fontStyle: "bold", fontSize: 13 },
        3: { cellWidth: 30, halign: "right" },
      },
      alternateRowStyles: {
        fillColor: DARK_CARD,
      },
      didDrawPage: () => {
        drawBackground();
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 20;
  }

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setTextColor(...GRAY_LIGHT);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generado: ${new Date().toLocaleString("es-CL")}  •  Página ${i}/${pageCount}`,
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  // ── Download ──
  doc.save(`Productos_Vendidos_J${data.jornadaNumber}_${data.fecha}.pdf`);
}
