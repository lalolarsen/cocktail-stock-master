/**
 * Plantilla única para todos los reportes PDF de STOCKIA.
 * Encabezado, KPIs, tablas, firma y pie con paginación homogéneos.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const M = 40;
const VENUE = "Berlín Valdivia";

export interface ReportCtx {
  doc: jsPDF;
  y: number;
  width: number;
}

export interface ReportHeader {
  title: string;
  jornadaNumber: number;
  fecha: string;
  horario?: string;
}

export function reportFileName(jornadaNumber: number, slug: string): string {
  return `jornada-${jornadaNumber}_${slug}.pdf`;
}

export function createReport(h: ReportHeader): ReportCtx {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, width, 70, "F");
  doc.setTextColor(0, 230, 118);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("STOCKIA", M, 26);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(h.title, M, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(VENUE, width - M, 26, { align: "right" });
  doc.text(`Jornada #${h.jornadaNumber} · ${h.fecha}`, width - M, 40, { align: "right" });
  if (h.horario) doc.text(h.horario, width - M, 54, { align: "right" });
  doc.setTextColor(0, 0, 0);
  return { doc, y: 92, width };
}

export function addKpis(ctx: ReportCtx, kpis: { label: string; value: string }[]): void {
  const n = Math.max(1, kpis.length);
  const gap = 8;
  const w = (ctx.width - M * 2 - gap * (n - 1)) / n;
  kpis.forEach((k, i) => {
    const x = M + i * (w + gap);
    ctx.doc.setDrawColor(220);
    ctx.doc.setFillColor(246, 246, 246);
    ctx.doc.roundedRect(x, ctx.y, w, 50, 3, 3, "FD");
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(7.5);
    ctx.doc.setTextColor(110);
    ctx.doc.text(k.label.toUpperCase(), x + 8, ctx.y + 16);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setFontSize(14);
    ctx.doc.setTextColor(0);
    ctx.doc.text(k.value, x + 8, ctx.y + 38);
  });
  ctx.y += 68;
}

export function addTable(
  ctx: ReportCtx,
  title: string,
  head: string[],
  body: (string | number)[][],
  opts: { rightCols?: number[]; empty?: string; foot?: (string | number)[] } = {},
): void {
  ensureSpace(ctx, 60);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(11);
  ctx.doc.setTextColor(0);
  ctx.doc.text(title, M, ctx.y);
  const columnStyles: Record<number, { halign: "right" }> = {};
  (opts.rightCols || []).forEach((c) => (columnStyles[c] = { halign: "right" }));
  const rows = body.length ? body : [[opts.empty || "Sin datos", ...Array(head.length - 1).fill("")]];
  autoTable(ctx.doc, {
    startY: ctx.y + 6,
    head: [head],
    body: rows.map((r) => r.map(String)),
    foot: opts.foot && body.length ? [opts.foot.map(String)] : undefined,
    margin: { left: M, right: M, bottom: 50 },
    styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", textColor: 20 },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles,
  });
  ctx.y = ((ctx.doc as any).lastAutoTable?.finalY ?? ctx.y) + 24;
}

export function addSignature(ctx: ReportCtx, role = "Responsable"): void {
  ensureSpace(ctx, 110);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(10);
  ctx.doc.text(`Firma ${role.toLowerCase()}`, M, ctx.y);
  const labels = ["Nombre", "Firma", "RUT (opcional)"];
  const w = (ctx.width - M * 2 - 20) / 3;
  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setFontSize(8.5);
  ctx.doc.setDrawColor(0);
  labels.forEach((l, i) => {
    const x = M + i * (w + 10);
    ctx.doc.line(x, ctx.y + 45, x + w, ctx.y + 45);
    ctx.doc.text(l, x, ctx.y + 58);
  });
  ctx.y += 80;
}

function ensureSpace(ctx: ReportCtx, h: number) {
  const ph = ctx.doc.internal.pageSize.getHeight();
  if (ctx.y + h > ph - 50) {
    ctx.doc.addPage();
    ctx.y = 50;
  }
}

export function finishReport(ctx: ReportCtx, filename: string): void {
  const pages = ctx.doc.getNumberOfPages();
  const ph = ctx.doc.internal.pageSize.getHeight();
  const gen = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  for (let i = 1; i <= pages; i++) {
    ctx.doc.setPage(i);
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(7.5);
    ctx.doc.setTextColor(130);
    ctx.doc.text(`STOCKIA · ${VENUE} · Generado ${gen}`, M, ph - 22);
    ctx.doc.text(`Página ${i} de ${pages}`, ctx.width - M, ph - 22, { align: "right" });
  }
  ctx.doc.save(filename);
}
