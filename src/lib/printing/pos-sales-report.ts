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
    total: number;
    totalCount: number;
  }[];
  grandTotal: number;
  grandCash: number;
  grandCard: number;
  grandOther: number;
  grandCount: number;
}

const fmt = (n: number) => `$${n.toLocaleString("es-CL")}`;

function buildReportHtml(data: POSSalesData): string {
  const sep = "================================================";
  const dash = "------------------------------------------------";

  const posBlocks = data.posSummary
    .map(
      (pos) => `
      <div class="pos-block">
        <div class="pos-name">${pos.posName}</div>
        <table class="items"><tbody>
          <tr>
            <td class="item-name">Efectivo (${pos.cashCount})</td>
            <td class="item-price">${fmt(pos.cashTotal)}</td>
          </tr>
          <tr>
            <td class="item-name">Tarjeta (${pos.cardCount})</td>
            <td class="item-price">${fmt(pos.cardTotal)}</td>
          </tr>
          ${pos.otherTotal > 0 ? `<tr>
            <td class="item-name">Otro (${pos.otherCount})</td>
            <td class="item-price">${fmt(pos.otherTotal)}</td>
          </tr>` : ""}
        </tbody></table>
        <div class="pos-total">
          <span>${pos.totalCount} ventas</span>
          <span class="pos-total-amount">${fmt(pos.total)}</span>
        </div>
        <div class="sep">${dash}</div>
      </div>`,
    )
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
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 0 2px; color: #000; }
    .venue-name { font-size: 14pt; font-weight: bold; margin-bottom: 4px; text-align: center; color: #000; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; color: #000; font-size: 8pt; }
    .meta { text-align: center; font-size: 9pt; color: #000; }
    .section-title { text-align: center; font-size: 11pt; font-weight: bold; margin: 6px 0 2px; color: #000; }
    .items { width: 100%; border-collapse: collapse; }
    .items td { padding: 1px 0; vertical-align: top; font-size: 9.5pt; color: #000; }
    .item-name { text-align: left; color: #000; }
    .item-price { text-align: right; white-space: nowrap; padding-left: 4px; color: #000; }
    .total-line { font-size: 13pt; font-weight: bold; text-align: right; margin: 4px 0; color: #000; }
    .pos-block { margin: 4px 0; }
    .pos-name { font-size: 10pt; font-weight: bold; margin: 4px 0 2px; color: #000; }
    .pos-total { display: flex; justify-content: space-between; font-size: 9.5pt; font-weight: bold; margin: 2px 0; color: #000; }
    .pos-total-amount { font-weight: bold; }
    .footer { text-align: center; margin-top: 10px; font-size: 8pt; color: #000; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 2mm; }
    }
  `;
}

export function printPOSSalesReport(data: POSSalesData): void {
  const html = buildReportHtml(data);
  const css = buildReportCss();
  printJS({ printable: html, type: "raw-html", style: css });
}

export type { POSSalesData };
