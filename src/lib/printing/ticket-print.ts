/**
 * Ticket sale printing — pivot post-QR.
 *
 * Cada venta imprime:
 *  1) COMPROBANTE del vendedor (resumen items + total + medio de pago)
 *  2) Una pieza COVER por cada entrada vendida — formato grande, sin QR
 *  3) Una pieza COVER por cada cover/cocktail vendido — formato grande, sin QR
 *
 * El cliente entrega físicamente las piezas al staff (acceso / barra).
 */

import { printOneDocument, type PaperWidth } from "./qz";
import { STOCKIA_PRINT_FOOTER } from "@/lib/commission";

const RECEIPT_VENUE_TITLE = "Berlín Valdivia";

export interface TicketSaleItem {
  name: string;
  quantity: number;
  price: number;
}

export interface TicketTokenPiece {
  /** raw token string stored in pickup_tokens.token — kept for traceability only */
  token: string;
  short_code?: string | null;
  ticket_type: string;
  /** for cover pieces */
  cocktail_name?: string | null;
}

export interface TicketSalePrintData {
  saleNumber: string;
  posName: string;
  dateTime: string;
  items: TicketSaleItem[];
  total: number;
  paymentMethod: "cash" | "card" | string;
  /** una por unidad de entrada vendida */
  entryTokens: TicketTokenPiece[];
  /** covers individuales */
  coverTokens: TicketTokenPiece[];
}

const SEP = {
  "58mm": "================================",
  "80mm": "================================================",
} as const;
const DASH = {
  "58mm": "--------------------------------",
  "80mm": "------------------------------------------------",
} as const;

/* ── CSS común ── */
function buildCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 4px 2px; padding-bottom: 40mm; }
    .venue-name { font-size: 18pt; font-weight: 900; margin-bottom: 4px; text-align: center; }
    .sep { margin: 4px 0; white-space: pre; text-align: center; font-size: 9pt; }
    .meta { text-align: center; font-size: 11pt; }
    .item-line { font-size: 14pt; font-weight: bold; padding: 2px 0; }
    .total-line { font-size: 15pt; font-weight: bold; text-align: right; margin: 4px 0; }
    .payment { text-align: center; margin: 4px 0; font-size: 11pt; }
    .ticket-kind { font-size: 28pt; font-weight: 900; text-align: center; letter-spacing: 6px; margin: 8px 0 6px; padding: 6px 0; border-top: 3px solid #000; border-bottom: 3px solid #000; }
    .ticket-name { text-align: center; font-size: 22pt; font-weight: 900; margin: 8px 0; word-break: break-word; line-height: 1.15; }
    .ticket-correlative { text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 6px; }
    .ticket-instruction { text-align: center; font-size: 12pt; margin-top: 10px; padding: 8px; border: 2px dashed #000; font-weight: bold; }
    .sale-meta { text-align: center; font-size: 11pt; margin-top: 8px; }
    .footer { text-align: center; margin-top: 10px; font-size: 11pt; }
    .stockia-footer { text-align: center; margin-top: 10px; padding-top: 6px; border-top: 2px solid #000; font-size: 11pt; font-weight: 900; letter-spacing: 0.3px; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

/* ── 1. Comprobante del vendedor ── */
function buildReceiptHtml(data: TicketSalePrintData, pw: PaperWidth): string {
  const sep = SEP[pw];
  const dash = DASH[pw];
  const items = data.items
    .map(
      (i) =>
        `<div class="item-line">${i.quantity}x ${i.name}  $${i.price.toLocaleString("es-CL")}</div>`,
    )
    .join("");
  const paymentLabel = data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta";

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="meta">${data.posName}</div>
      <div class="meta">Venta: ${data.saleNumber}</div>
      <div class="meta">${data.dateTime}</div>
      <div class="sep">${sep}</div>
      <div>${items}</div>
      <div class="sep">${dash}</div>
      <div class="total-line">TOTAL: $${data.total.toLocaleString("es-CL")}</div>
      <div class="payment">Pago: ${paymentLabel}</div>
      <div class="footer">Comprobante del vendedor</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/* ── 2. Entrada individual (sin QR) ── */
function buildEntryHtml(
  piece: TicketTokenPiece,
  index: number,
  total: number,
  saleNumber: string,
  pw: PaperWidth,
): string {
  const sep = SEP[pw];

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="ticket-kind">ENTRADA</div>
      <div class="ticket-name">${piece.ticket_type}</div>
      <div class="ticket-correlative">${index} / ${total}</div>
      <div class="ticket-instruction">Entrega este ticket en el acceso</div>
      <div class="sale-meta">Venta N° ${saleNumber}</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/* ── 3. Cover individual (sin QR) ── */
function buildCoverHtml(piece: TicketTokenPiece, saleNumber: string, pw: PaperWidth): string {
  const sep = SEP[pw];

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="ticket-kind">COVER</div>
      <div class="ticket-name">${piece.cocktail_name || "Cover"}</div>
      <div class="ticket-correlative">${piece.ticket_type}</div>
      <div class="ticket-instruction">Entrega este cover en la barra</div>
      <div class="sale-meta">Venta N° ${saleNumber}</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/**
 * Imprime todas las piezas como jobs independientes (iframe propio cada uno):
 * comprobante → entradas → covers. Sin QRs.
 *
 * `options.includeQrPieces` se conserva por compatibilidad: si es `false`,
 * solo se imprime el comprobante; si es `true` o no se especifica, se
 * imprimen también las entradas y covers (ahora sin QR).
 */
export async function printTicketSale(
  data: TicketSalePrintData,
  paperWidth: PaperWidth = "80mm",
  options: { includeQrPieces?: boolean } = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    const css = buildCss(paperWidth);
    const pieces: string[] = [buildReceiptHtml(data, paperWidth)];
    const totalEntries = data.entryTokens.length;

    if (options.includeQrPieces !== false) {
      for (let idx = 0; idx < totalEntries; idx++) {
        pieces.push(
          buildEntryHtml(data.entryTokens[idx], idx + 1, totalEntries, data.saleNumber, paperWidth),
        );
      }

      for (const cover of data.coverTokens) {
        pieces.push(buildCoverHtml(cover, data.saleNumber, paperWidth));
      }
    }

    let lastError: string | undefined;
    let anySuccess = false;
    for (const piece of pieces) {
      const result = await printOneDocument(piece, css);
      if (result.success) anySuccess = true;
      else lastError = result.error;
    }
    if (!anySuccess) return { success: false, error: lastError || "Error de impresión" };
    return { success: true, error: lastError };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de impresión";
    console.error("[printTicketSale] error:", error);
    return { success: false, error: message };
  }
}
