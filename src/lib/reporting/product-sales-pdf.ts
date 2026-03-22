/**
 * Generates a printable 80mm thermal receipt report of products sold per POS terminal.
 * Uses print-js with the same styling as the POS sales report.
 */
import printJS from "print-js";

export interface ProductSaleRow {
  cocktailName: string;
  category: string;
  quantity: number;
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

const fmt = (n: number) => `$${n.toLocaleString("es-CL")}`;

function buildHtml(data: ProductSalesReportData): string {
  const sep = "================================================";
  const dash = "------------------------------------------------";

  const posBlocks = data.posSections
    .map((pos) => {
      const productRows = pos.products
        .map(
          (p) => `
          <tr>
            <td class="prod-qty">${p.quantity}</td>
            <td class="prod-name">${p.cocktailName}</td>
            <td class="prod-price">${fmt(p.revenue)}</td>
          </tr>`
        )
        .join("");

      return `
        <div class="pos-block">
          <div class="pos-name">${pos.posName}</div>
          <div class="sep">${dash}</div>
          <table class="products"><tbody>
            <tr class="prod-header">
              <td class="prod-qty">Cant</td>
              <td class="prod-name">Producto</td>
              <td class="prod-price">Ingreso</td>
            </tr>
            ${productRows}
          </tbody></table>
          <div class="pos-total">
            <span>${pos.totalUnits} unidades</span>
            <span class="pos-total-amount">${fmt(pos.totalRevenue)}</span>
          </div>
          <div class="sep">${sep}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="receipt">
      <div class="venue-name">PRODUCTOS VENDIDOS</div>
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
      <div class="total-line">${data.grandTotalUnits} UNIDADES</div>
      <div class="total-line">TOTAL: ${fmt(data.grandTotalRevenue)}</div>
      <div class="sep">${sep}</div>
      <div class="footer">Generado: ${new Date().toLocaleString("es-CL")}</div>
    </div>
  `;
}

function buildCss(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 0 2px; color: #000; }
    .venue-name { font-size: 16pt; font-weight: bold; margin-bottom: 4px; text-align: center; color: #000; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; color: #000; font-size: 8pt; }
    .meta { text-align: center; font-size: 10pt; color: #000; }
    .section-title { text-align: center; font-size: 13pt; font-weight: bold; margin: 6px 0 2px; color: #000; }
    .products { width: 100%; border-collapse: collapse; }
    .products td { padding: 2px 0; vertical-align: top; color: #000; }
    .prod-header td { font-size: 9pt; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 2px; }
    .prod-qty { width: 36px; text-align: center; font-size: 14pt; font-weight: bold; color: #000; }
    .prod-name { text-align: left; font-size: 11pt; font-weight: bold; color: #000; }
    .prod-price { text-align: right; white-space: nowrap; padding-left: 4px; font-size: 10pt; color: #000; }
    .total-line { font-size: 14pt; font-weight: bold; text-align: center; margin: 4px 0; color: #000; }
    .pos-block { margin: 4px 0; }
    .pos-name { font-size: 13pt; font-weight: bold; margin: 6px 0 2px; text-align: center; color: #000; text-decoration: underline; }
    .pos-total { display: flex; justify-content: space-between; font-size: 11pt; font-weight: bold; margin: 4px 0; color: #000; }
    .pos-total-amount { font-weight: bold; }
    .footer { text-align: center; margin-top: 10px; font-size: 8pt; color: #000; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 2mm; }
    }
  `;
}

export function generateProductSalesPDF(data: ProductSalesReportData): void {
  const html = buildHtml(data);
  const css = buildCss();
  printJS({ printable: html, type: "raw-html", style: css });
}
