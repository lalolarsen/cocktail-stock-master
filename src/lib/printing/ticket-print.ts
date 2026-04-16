/**
 * Ticket sale printing — 3 piezas por venta:
 *  1. Comprobante de venta (resumen items + total + medio de pago)
 *  2. Entrada(s)  — 1 ticket por unidad con QR PICKUP:<token>
 *  3. Cover(s)    — 1 ticket por cover con QR PICKUP:<token> + cocktail asignado
 *
 * Usa el mismo formato de QR (PICKUP:<token>) y short_code que las ventas POS
 * normales para garantizar que la barra los redime con el pipeline existente.
 */

import printJS from "print-js";
import { generateQRSvgString } from "./qr-svg";
import type { PaperWidth } from "./qz";
import { STOCKIA_PRINT_FOOTER } from "@/lib/commission";

const RECEIPT_VENUE_TITLE = "Berlín Valdivia";

export interface TicketSaleItem {
  name: string;
  quantity: number;
  price: number;
}

export interface TicketTokenPiece {
  /** raw token string stored in pickup_tokens.token */
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
  /** uno por unidad de entrada vendida (no covers) */
  entryTokens: TicketTokenPiece[];
  /** covers individuales */
  coverTokens: TicketTokenPiece[];
}

/* ── CSS común para todas las piezas ── */
function buildCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 0 2px; padding-bottom: 40mm; color: #000; }
    .venue-name { font-size: 16pt; font-weight: bold; margin-bottom: 4px; text-align: center; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; }
    .meta { text-align: center; font-size: 11pt; }
    .item-line { font-size: 14pt; font-weight: bold; padding: 2px 0; }
    .total-line { font-size: 15pt; font-weight: bold; text-align: right; margin: 4px 0; }
    .payment { text-align: center; margin: 4px 0; font-size: 11pt; }
    .qr-section { text-align: center; margin: 10px 0; }
    .qr-section svg { display: inline-block; max-width: 90%; height: auto; }
    .qr-label { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }
    .qr-instruction { font-size: 10pt; margin-top: 6px; padding: 6px; border: 1px dashed #000; }
    .short-code { text-align: center; margin-top: 8px; font-size: 22pt; font-weight: bold; letter-spacing: 6px; }
    .short-code-label { text-align: center; font-size: 11pt; margin-top: 2px; }
    .ticket-kind { font-size: 18pt; font-weight: bold; text-align: center; margin: 6px 0; padding: 4px; border-top: 2px solid #000; border-bottom: 2px solid #000; }
    .ticket-name { text-align: center; font-size: 14pt; font-weight: bold; margin: 4px 0; }
    .ticket-correlative { text-align: center; font-size: 12pt; margin-bottom: 6px; }
    .footer { text-align: center; margin-top: 10px; font-size: 11pt; }
    .stockia-footer { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid #000; font-size: 9pt; font-style: italic; color: #000; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

const SEP = {
  "58mm": "================================",
  "80mm": "================================================",
} as const;
const DASH = {
  "58mm": "--------------------------------",
  "80mm": "------------------------------------------------",
} as const;

/* ── 1. Comprobante de venta ── */
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
      <div class="footer">Gracias por tu compra</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/* ── 2. Entrada individual ── */
function buildEntryHtml(
  piece: TicketTokenPiece,
  index: number,
  total: number,
  pw: PaperWidth,
): string {
  const sep = SEP[pw];
  const qrSize = pw === "58mm" ? 220 : 280;
  const qrSvg = generateQRSvgString(`PICKUP:${piece.token}`, qrSize);
  const shortCodeHtml = piece.short_code
    ? `<div class="short-code">${piece.short_code.split("").join(" ")}</div>
       <div class="short-code-label">CÓDIGO DE ACCESO</div>`
    : "";

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="ticket-kind">ENTRADA</div>
      <div class="ticket-name">${piece.ticket_type}</div>
      <div class="ticket-correlative">${index} / ${total}</div>
      <div class="qr-section">
        ${qrSvg}
        ${shortCodeHtml}
        <div class="qr-instruction">
          Presenta este QR en el acceso
        </div>
      </div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/* ── 3. Cover individual ── */
function buildCoverHtml(piece: TicketTokenPiece, pw: PaperWidth): string {
  const sep = SEP[pw];
  const qrSize = pw === "58mm" ? 220 : 280;
  const qrSvg = generateQRSvgString(`PICKUP:${piece.token}`, qrSize);
  const shortCodeHtml = piece.short_code
    ? `<div class="short-code">${piece.short_code.split("").join(" ")}</div>
       <div class="short-code-label">CÓDIGO DE RETIRO</div>`
    : "";

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="ticket-kind">COVER</div>
      <div class="ticket-name">${piece.cocktail_name || "Cover"}</div>
      <div class="ticket-correlative">${piece.ticket_type}</div>
      <div class="qr-section">
        ${qrSvg}
        ${shortCodeHtml}
        <div class="qr-instruction">
          Presenta este QR o dicta el código en la barra
        </div>
      </div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/* ── helper: print one piece ── */
function printPiece(html: string, css: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      printJS({
        printable: html,
        type: "raw-html",
        style: css,
        onError: (err: any) => {
          console.error("[ticket-print] error:", err);
          resolve();
        },
      });
      resolve();
    } catch (err) {
      console.error("[ticket-print] exception:", err);
      resolve();
    }
  });
}

/**
 * Imprime las 3 piezas en orden: comprobante → entradas → covers.
 * Inserta delays entre piezas para evitar que el spooler colapse.
 */
export async function printTicketSale(
  data: TicketSalePrintData,
  paperWidth: PaperWidth = "80mm",
): Promise<{ success: boolean; error?: string }> {
  try {
    const css = buildCss(paperWidth);

    // 1. Comprobante
    await printPiece(buildReceiptHtml(data, paperWidth), css);
    await new Promise((r) => setTimeout(r, 1200));

    // 2. Entradas (una por unidad)
    const totalEntries = data.entryTokens.length;
    for (let idx = 0; idx < totalEntries; idx++) {
      await printPiece(
        buildEntryHtml(data.entryTokens[idx], idx + 1, totalEntries, paperWidth),
        css,
      );
      await new Promise((r) => setTimeout(r, 1200));
    }

    // 3. Covers (uno por cover)
    for (const cover of data.coverTokens) {
      await printPiece(buildCoverHtml(cover, paperWidth), css);
      await new Promise((r) => setTimeout(r, 1200));
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de impresión";
    console.error("[printTicketSale] error:", error);
    return { success: false, error: message };
  }
}
