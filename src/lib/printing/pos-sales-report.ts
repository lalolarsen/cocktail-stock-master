/**
 * Generate a receipt-sized HTML report of jornada sales broken down by POS
 * and payment method. Uses the same 80mm receipt styling as QR tickets.
 */
import printJS from "print-js";
import { calculateCommission, STOCKIA_COMMISSION_RATE } from "@/lib/commission";

interface POSSalesData {
  jornadaNumber: number;
  fecha: string;
  horario: string;
  posSummary: {
    posName: string;
    cashTotal: number;
    cashCount: number;
    cardTotal: number;
    cardCount: number;
    otherTotal: number;
    otherCount: number;
    // Tickets (entrada) – separados de alcohol
    ticketCashTotal?: number;
    ticketCashCount?: number;
    ticketCardTotal?: number;
    ticketCardCount?: number;
    ticketOtherTotal?: number;
    ticketOtherCount?: number;
    total: number;
    totalCount: number;
    // Cuadre de caja
    openingCash?: number;
    expectedCash?: number;
    countedCash?: number | null;
    difference?: number | null;
    bartenderName?: string | null;
    confirmed?: boolean;
    notes?: string | null;
  }[];
  grandTotal: number;
  grandCash: number;
  grandCard: number;
  grandOther: number;
  grandCount: number;
}

const fmt = (n: number) => `$${n.toLocaleString("es-CL")}`;

function buildReportHtml(data: POSSalesData): string {
  const sep = "========================================";
  const dash = "----------------------------------------";

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const posBlocks = data.posSummary
    .map((pos) => {
      const hasClosingInfo =
        (pos.bartenderName && pos.bartenderName.trim()) ||
        pos.confirmed ||
        (pos.notes && pos.notes.trim());

      const tCash = pos.ticketCashTotal ?? 0;
      const tCard = pos.ticketCardTotal ?? 0;
      const tOther = pos.ticketOtherTotal ?? 0;
      const hasTickets = tCash + tCard + tOther > 0;

      const ticketsBlock = hasTickets
        ? `
        <div class="subsection">TICKETS (entrada)</div>
        <table class="items"><tbody>
          ${tCash > 0 ? `<tr><td class="item-name">Efectivo (${pos.ticketCashCount ?? 0})</td><td class="item-price">${fmt(tCash)}</td></tr>` : ""}
          ${tCard > 0 ? `<tr><td class="item-name">Tarjeta (${pos.ticketCardCount ?? 0})</td><td class="item-price">${fmt(tCard)}</td></tr>` : ""}
          ${tOther > 0 ? `<tr><td class="item-name">Otro (${pos.ticketOtherCount ?? 0})</td><td class="item-price">${fmt(tOther)}</td></tr>` : ""}
        </tbody></table>`
        : "";

      const hasAlcohol = pos.cashTotal + pos.cardTotal + pos.otherTotal > 0;
      const alcoholBlock = hasAlcohol
        ? `
        ${hasTickets ? `<div class="subsection">ALCOHOL / CARTA</div>` : ""}
        <table class="items"><tbody>
          <tr><td class="item-name">Efectivo (${pos.cashCount})</td><td class="item-price">${fmt(pos.cashTotal)}</td></tr>
          <tr><td class="item-name">Tarjeta (${pos.cardCount})</td><td class="item-price">${fmt(pos.cardTotal)}</td></tr>
          ${pos.otherTotal > 0 ? `<tr><td class="item-name">Otro (${pos.otherCount})</td><td class="item-price">${fmt(pos.otherTotal)}</td></tr>` : ""}
        </tbody></table>`
        : "";

      // Cuadre de caja (efectivo)
      const opening = pos.openingCash ?? 0;
      const expected = pos.expectedCash ?? 0;
      const counted = pos.countedCash;
      const diff = pos.difference;
      const cashEffective = pos.cashTotal + tCash;
      const showCuadre = opening > 0 || cashEffective > 0 || expected > 0 || counted != null;
      const diffLabel = diff == null ? "Pendiente conteo" : diff === 0 ? "CUADRADO" : diff > 0 ? `SOBRANTE ${fmt(Math.abs(diff))}` : `FALTANTE ${fmt(Math.abs(diff))}`;
      const cuadreBlock = showCuadre
        ? `
        <div class="subsection">CUADRE EFECTIVO</div>
        <table class="items"><tbody>
          <tr><td class="item-name">Apertura</td><td class="item-price">${fmt(opening)}</td></tr>
          <tr><td class="item-name">+ Ventas efectivo</td><td class="item-price">${fmt(cashEffective)}</td></tr>
          <tr><td class="item-name"><strong>= Esperado</strong></td><td class="item-price"><strong>${fmt(expected)}</strong></td></tr>
          <tr><td class="item-name">Contado</td><td class="item-price">${counted != null ? fmt(counted) : "_______"}</td></tr>
          <tr><td class="item-name"><strong>Diferencia</strong></td><td class="item-price"><strong>${diffLabel}</strong></td></tr>
        </tbody></table>`
        : "";

      const closingBlock = hasClosingInfo
        ? `
        <div class="closing-block">
          ${pos.bartenderName ? `<div class="closing-line"><strong>Bartender:</strong> ${escape(pos.bartenderName)}</div>` : ""}
          <div class="closing-line">${pos.confirmed ? "[X]" : "[ ]"} Cuadre físico confirmado</div>
          ${pos.notes ? `<div class="closing-line"><strong>Observaciones:</strong></div><div class="closing-notes">${escape(pos.notes)}</div>` : ""}
        </div>`
        : "";

      return `
      <div class="pos-block">
        <div class="pos-name">${escape(pos.posName)}</div>
        ${alcoholBlock}
        ${ticketsBlock}
        <div class="pos-total">
          <span>${pos.totalCount} ventas</span>
          <span class="pos-total-amount">${fmt(pos.total)}</span>
        </div>
        ${cuadreBlock}
        ${closingBlock}
        <div class="sep">${dash}</div>
      </div>`;
    })
    .join("");

  return `
    <div class="receipt">
      <div class="venue-name">REPORTE DE VENTAS</div>
      <div class="sep">${sep}</div>
      <div class="meta">Jornada #${data.jornadaNumber}</div>
      <div class="meta">${data.fecha}</div>
      <div class="meta">${data.horario}</div>
      <div class="sep">${sep}</div>
      <div class="section-title">DESGLOSE POR POS</div>
      <div class="sep">${dash}</div>
      ${posBlocks}
      <div class="section-title">RESUMEN GENERAL</div>
      <div class="sep">${dash}</div>
      <table class="items"><tbody>
        <tr>
          <td class="item-name">Total Efectivo</td>
          <td class="item-price">${fmt(data.grandCash)}</td>
        </tr>
        <tr>
          <td class="item-name">Total Tarjeta</td>
          <td class="item-price">${fmt(data.grandCard)}</td>
        </tr>
        ${data.grandOther > 0 ? `<tr>
          <td class="item-name">Total Otro</td>
          <td class="item-price">${fmt(data.grandOther)}</td>
        </tr>` : ""}
      </tbody></table>
      <div class="sep">${dash}</div>
      <div class="total-line">TOTAL: ${fmt(data.grandTotal)}</div>
      <div class="meta">${data.grandCount} ventas</div>
      <div class="sep">${dash}</div>
      <table class="items"><tbody>
        <tr>
          <td class="item-name"><strong>Comisión STOCKIA (${(STOCKIA_COMMISSION_RATE * 100).toFixed(1).replace(/\.0$/, "")}%)</strong></td>
          <td class="item-price"><strong>${fmt(calculateCommission(data.grandTotal))}</strong></td>
        </tr>
      </tbody></table>
      <div class="meta" style="font-size:8pt;">Informativo · no afecta caja</div>
      <div class="sep">${sep}</div>
      <div class="footer">Generado: ${new Date().toLocaleString("es-CL")}</div>
    </div>
  `;
}

function buildReportCss(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    html, body { width: 80mm; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 9pt; color: #000; background: #fff; padding: 0; margin: 0; }
    .receipt { width: 100%; padding: 0; color: #000; }
    .venue-name { font-size: 13pt; font-weight: bold; margin-bottom: 4px; text-align: center; color: #000; }
    .sep { margin: 2px 0; white-space: nowrap; overflow: hidden; text-align: center; color: #000; font-size: 7pt; letter-spacing: -0.5px; }
    .meta { text-align: center; font-size: 8.5pt; color: #000; }
    .section-title { text-align: center; font-size: 10pt; font-weight: bold; margin: 6px 0 2px; color: #000; }
    .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .items td { padding: 1px 0; vertical-align: top; font-size: 9pt; color: #000; word-wrap: break-word; }
    .item-name { text-align: left; color: #000; width: 60%; }
    .item-price { text-align: right; white-space: nowrap; padding-left: 4px; color: #000; width: 40%; }
    .total-line { font-size: 12pt; font-weight: bold; text-align: right; margin: 4px 0; color: #000; }
    .pos-block { margin: 4px 0; }
    .pos-name { font-size: 10pt; font-weight: bold; margin: 4px 0 2px; color: #000; word-wrap: break-word; }
    .pos-total { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin: 2px 0; color: #000; }
    .pos-total-amount { font-weight: bold; }
    .closing-block { margin: 3px 0 4px; padding: 3px 4px; border: 1px dashed #000; font-size: 8.5pt; color: #000; }
    .closing-line { margin: 1px 0; color: #000; word-wrap: break-word; }
    .closing-notes { margin: 1px 0 1px 4px; color: #000; word-wrap: break-word; white-space: pre-wrap; font-style: italic; }
    .footer { text-align: center; margin-top: 10px; font-size: 8pt; color: #000; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      html, body { width: 80mm; margin: 0; padding: 0; }
      body { padding: 1mm 2mm 4mm 2mm; }
    }
  `;
}

export function printPOSSalesReport(data: POSSalesData): void {
  const html = buildReportHtml(data);
  const css = buildReportCss();
  printJS({ printable: html, type: "raw-html", style: css });
}

export type { POSSalesData };
