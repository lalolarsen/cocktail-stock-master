/**
 * Generates a PDF report of all courtesy QR redemption attempts for a jornada.
 * Includes successful and failed attempts with full audit detail.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface CourtesyRedemptionRow {
  redeemedAt: string;          // ISO
  product: string;
  qty: number;
  note: string | null;
  code: string;
  redeemedBy: string;          // worker name or short uid
  posSource: string;           // "Barra" | "POS Híbrido" | "—"
  result: "success" | "fail";
  reason: string | null;
}

export interface CourtesyJornadaPdfData {
  jornadaNumber: number;
  fecha: string;
  horario: string;
  venueName?: string;
  issued: number;
  rows: CourtesyRedemptionRow[];
}

const fmtTime = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "already_redeemed": return "Ya canjeado";
    case "expired": return "Expirado";
    case "cancelled": return "Cancelado";
    case "not_found": return "No encontrado";
    case "empty_code": return "Código vacío";
    default: return reason || "—";
  }
}

export function generateCourtesyJornadaPDF(data: CourtesyJornadaPdfData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte de Cortesías", pageWidth / 2, 40, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Jornada #${data.jornadaNumber}`, pageWidth / 2, 58, { align: "center" });
  doc.text(`${data.fecha} · ${data.horario}`, pageWidth / 2, 72, { align: "center" });
  if (data.venueName) {
    doc.text(data.venueName, pageWidth / 2, 86, { align: "center" });
  }

  // KPIs
  const ok = data.rows.filter(r => r.result === "success");
  const fail = data.rows.filter(r => r.result === "fail");
  const totalQty = ok.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const byBar = ok.filter(r => r.posSource === "Barra").length;
  const byHybrid = ok.filter(r => r.posSource === "POS Híbrido").length;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen", 40, 110);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const kpiLines = [
    `QR emitidos en la jornada: ${data.issued}`,
    `Canjes exitosos: ${ok.length}  ·  Unidades entregadas: ${totalQty}`,
    `Canales: Barra ${byBar}  ·  POS Híbrido ${byHybrid}`,
    `Intentos fallidos (auditoría): ${fail.length}`,
  ];
  kpiLines.forEach((l, i) => doc.text(l, 40, 128 + i * 14));

  // Table — successful redemptions
  const successBody = ok.map(r => [
    fmtTime.format(new Date(r.redeemedAt)),
    r.product,
    String(r.qty),
    r.note || "—",
    r.code,
    r.redeemedBy,
    r.posSource,
  ]);

  autoTable(doc, {
    startY: 200,
    head: [["Hora", "Producto", "Cant.", "Observación", "Código", "Canjeado por", "POS"]],
    body: successBody.length > 0 ? successBody : [["—", "Sin canjes exitosos en esta jornada", "", "", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [0, 230, 118], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 130 },
      2: { cellWidth: 35, halign: "center" },
      3: { cellWidth: 130 },
      4: { cellWidth: 70 },
      5: { cellWidth: 75 },
      6: { cellWidth: 60 },
    },
    didDrawPage: () => {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Canjes exitosos", 40, 190);
    },
  });

  // Table — failed attempts (audit)
  if (fail.length > 0) {
    const lastY = (doc as any).lastAutoTable?.finalY ?? 240;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Intentos fallidos", 40, lastY + 30);

    const failBody = fail.map(r => [
      fmtTime.format(new Date(r.redeemedAt)),
      r.code || "—",
      reasonLabel(r.reason),
      r.redeemedBy,
      r.posSource,
    ]);
    autoTable(doc, {
      startY: lastY + 38,
      head: [["Hora", "Código", "Motivo", "Intentado por", "POS"]],
      body: failBody,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 90 },
        2: { cellWidth: 110 },
        3: { cellWidth: 130 },
        4: { cellWidth: 70 },
      },
    });
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generado: ${new Date().toLocaleString("es-CL")}`, pageWidth / 2, pageHeight - 20, { align: "center" });

  doc.save(`cortesias_jornada_${data.jornadaNumber}.pdf`);
}
