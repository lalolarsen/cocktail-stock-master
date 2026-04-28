/**
 * Generates a professional PDF report of the current inventory snapshot.
 * A4 portrait, grouped by location, with summary, totals and active alerts.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCLP } from "@/lib/currency";
import type { InventorySnapshotRow, InventoryTotals } from "@/hooks/useRealtimeInventory";

interface BuildArgs {
  venueName: string;
  generatedBy?: string | null;
  rows: InventorySnapshotRow[];
  totals: InventoryTotals;
}

const PRIMARY: [number, number, number] = [0, 230, 118]; // #00E676
const DARK: [number, number, number] = [20, 20, 20];
const MUTED: [number, number, number] = [110, 110, 110];
const RED_BG: [number, number, number] = [255, 235, 235];
const YELLOW_BG: [number, number, number] = [255, 248, 220];

function ts() {
  return new Date().toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fileTs() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function generateInventorySnapshotPDF({ venueName, generatedBy, rows, totals }: BuildArgs) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Header band ──
  const drawHeader = () => {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 60, "F");
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 60, pageWidth, 3, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("INFORME DE INVENTARIO", margin, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`STOCKIA · ${venueName}`, margin, 46);
    doc.text(`Generado: ${ts()}`, pageWidth - margin, 46, { align: "right" });
  };

  drawHeader();

  // ── Resumen general ──
  let cursorY = 88;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumen general", margin, cursorY);
  cursorY += 10;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: PRIMARY, textColor: DARK, fontStyle: "bold" },
    head: [["Capital inmovilizado", "Productos con stock", "Bajo mínimo", "Sin stock"]],
    body: [[
      formatCLP(totals.totalValue),
      String(totals.productCount),
      String(totals.lowCount),
      String(totals.criticalCount),
    ]],
  });

  cursorY = (doc as any).lastAutoTable.finalY + 18;

  // ── Por ubicación (subtotales) ──
  const byLocation = new Map<string, { name: string; type: string | null; rows: InventorySnapshotRow[]; subtotal: number }>();
  for (const r of rows) {
    const e = byLocation.get(r.location_id) ?? { name: r.location_name, type: r.location_type, rows: [], subtotal: 0 };
    e.rows.push(r);
    e.subtotal += Number(r.stock_value) || 0;
    byLocation.set(r.location_id, e);
  }
  const locs = Array.from(byLocation.values()).sort((a, b) => {
    const aw = (a.type ?? "").toLowerCase().includes("bodega") ? 0 : 1;
    const bw = (b.type ?? "").toLowerCase().includes("bodega") ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.name.localeCompare(b.name);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Capital por ubicación", margin, cursorY);
  cursorY += 10;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    head: [["Ubicación", "Productos", "Subtotal"]],
    body: locs.map((l) => [l.name, String(l.rows.length), formatCLP(Math.round(l.subtotal))]),
    foot: [["TOTAL", String(rows.length), formatCLP(totals.totalValue)]],
    footStyles: { fillColor: DARK, textColor: 255, fontStyle: "bold" },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 18;

  // ── Detalle por ubicación ──
  for (const loc of locs) {
    if (cursorY > pageHeight - 100) {
      doc.addPage();
      drawHeader();
      cursorY = 88;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(loc.name, margin, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${loc.rows.length} productos · ${formatCLP(Math.round(loc.subtotal))}`, pageWidth - margin, cursorY, { align: "right" });
    cursorY += 6;

    const sorted = [...loc.rows].sort((a, b) => a.product_name.localeCompare(b.product_name));

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [245, 245, 245], textColor: DARK, fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "center" },
      },
      head: [["SKU", "Producto", "Stock", "CPP", "Valor", "Estado"]],
      body: sorted.map((r) => [
        r.sku_base ?? "—",
        `${r.product_name}${r.is_bottle && r.capacity_ml ? ` (${r.capacity_ml}ml)` : ""}`,
        r.is_bottle ? `${Math.round(r.quantity)} ml` : Number(r.quantity).toLocaleString("es-CL"),
        formatCLP(Math.round(r.cpp)),
        formatCLP(Math.round(r.stock_value)),
        r.status === "critical" ? "Sin stock" : r.status === "low" ? "Bajo" : "OK",
      ]),
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const r = sorted[data.row.index];
        if (!r) return;
        if (r.status === "critical") data.cell.styles.fillColor = RED_BG;
        else if (r.status === "low") data.cell.styles.fillColor = YELLOW_BG;
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 14;
  }

  // ── Alertas activas ──
  const critical = rows.filter((r) => r.status === "critical");
  const low = rows.filter((r) => r.status === "low");

  if (critical.length || low.length) {
    if (cursorY > pageHeight - 120) {
      doc.addPage();
      drawHeader();
      cursorY = 88;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text("Alertas activas", margin, cursorY);
    cursorY += 10;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: "bold" },
      head: [["Severidad", "Producto", "Ubicación", "Stock"]],
      body: [
        ...critical.map((r) => ["SIN STOCK", r.product_name, r.location_name, r.is_bottle ? `${Math.round(r.quantity)} ml` : String(r.quantity)]),
        ...low.map((r) => ["BAJO", r.product_name, r.location_name, r.is_bottle ? `${Math.round(r.quantity)} ml` : String(r.quantity)]),
      ],
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        if (data.cell.raw === "SIN STOCK") {
          data.cell.styles.fillColor = RED_BG;
          data.cell.styles.textColor = [180, 30, 30];
          data.cell.styles.fontStyle = "bold";
        } else if (data.cell.raw === "BAJO") {
          data.cell.styles.fillColor = YELLOW_BG;
          data.cell.styles.textColor = [150, 100, 0];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // ── Footer en cada página ──
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const footer = `Página ${i} de ${total}${generatedBy ? ` · Generado por ${generatedBy}` : ""}`;
    doc.text(footer, pageWidth / 2, pageHeight - 18, { align: "center" });
  }

  doc.save(`inventario_${venueName.replace(/[^\w-]/g, "_")}_${fileTs()}.pdf`);
}
