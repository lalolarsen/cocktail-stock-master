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
import { STOCKIA_PRINT_FOOTER } from "@/lib/branding";

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
  /** jornada a la que pertenece la venta (se imprime en cada pieza) */
  jornadaName?: string | null;
  jornadaNumber?: number | null;
}

/** Bloque de jornada impreso en entradas y covers */
function jornadaBlock(data: TicketSalePrintData): string {
  if (!data.jornadaName && !data.jornadaNumber) return "";
  return `
      <div class="jornada-block">
        ${data.jornadaName ? `<div class="jornada-name">${data.jornadaName}</div>` : ""}
        ${data.jornadaNumber ? `<div class="jornada-num">JORNADA #${data.jornadaNumber}</div>` : ""}
        <div class="jornada-warn">VÁLIDO SOLO ESTA JORNADA</div>
        <div class="jornada-date">${data.dateTime}</div>
      </div>`;
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
    .jornada-block { text-align: center; margin: 8px 0; padding: 6px 0; border: 3px solid #000; }
    .jornada-name { font-size: 22pt; font-weight: 900; line-height: 1.1; word-break: break-word; }
    .jornada-num { font-size: 14pt; font-weight: 900; letter-spacing: 1px; margin-top: 2px; }
    .jornada-warn { font-size: 14pt; font-weight: 900; margin-top: 6px; padding: 4px 0; background: #000; color: #fff !important; }
    .jornada-date { font-size: 11pt; font-weight: bold; margin-top: 4px; }
    .sale-meta { text-align: center; font-size: 11pt; margin-top: 8px; }
    .footer { text-align: center; margin-top: 10px; font-size: 11pt; }
    .stockia-footer { text-align: center; margin-top: 10px; padding-top: 6px; border-top: 2px solid #000; font-size: 11pt; font-weight: 900; letter-spacing: 0.3px; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

/* ── 3. Cover individual (sin QR) ── */
function buildCoverHtml(data: TicketSalePrintData, piece: TicketTokenPiece, pw: PaperWidth): string {
  const saleNumber = data.saleNumber;
  const sep = SEP[pw];

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="ticket-kind">COVER</div>
      ${jornadaBlock(data)}
      <div class="ticket-name">${piece.cocktail_name || "Cover"}</div>
      <div class="ticket-correlative">${piece.ticket_type}</div>
      <div class="ticket-instruction">Entrega este cover en la barra</div>
      <div class="sale-meta">Cover N° ${piece.short_code || piece.token.slice(0, 8).toUpperCase()} · Venta ${saleNumber}</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/* ── RawBT (tablets Android) ── */
const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

const ascii = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "");

function buildCoversRawBtPayload(data: TicketSalePrintData): string {
  const encoder = new TextEncoder();
  const text = (v: string) => Array.from(encoder.encode(ascii(v)));
  const bytes: number[] = [0x1b, 0x40, 0x1b, 0x61, 0x01];
  data.coverTokens.forEach((cover) => {
    const code = cover.short_code || cover.token.slice(0, 8).toUpperCase();
    bytes.push(
      ...text("BERLIN VALDIVIA\n"),
      0x1d, 0x21, 0x11, 0x1b, 0x45, 0x01,
      ...text("COVER\n"),
      0x1d, 0x21, 0x00,
      ...text("================================\n"),
    );
    if (data.jornadaName) bytes.push(0x1d, 0x21, 0x11, ...text(`${data.jornadaName}\n`), 0x1d, 0x21, 0x00);
    if (data.jornadaNumber) bytes.push(...text(`JORNADA #${data.jornadaNumber}\n`));
    bytes.push(
      0x1d, 0x42, 0x01,
      ...text(" VALIDO SOLO ESTA JORNADA \n"),
      0x1d, 0x42, 0x00,
      ...text(`${data.dateTime}\n`),
      ...text("================================\n"),
      0x1d, 0x21, 0x11,
      ...text(`${cover.cocktail_name || "Cover"}\n`),
      0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00,
      ...text(`${cover.ticket_type}\n`),
      0x1b, 0x45, 0x01,
      ...text("ENTREGA ESTE COVER EN LA BARRA\n"),
      0x1b, 0x45, 0x00,
      ...text(`Cover N ${code} - Venta ${data.saleNumber}\n`),
      0x1b, 0x64, 0x04,
      ...text("- - - - - >8 - - - - - - - - - -\n"),
      0x1b, 0x64, 0x03,
      0x1d, 0x56, 0x42, 0x00,
    );
  });
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return window.btoa(binary);
}

/**
 * Imprime SOLO los covers de la venta (sin comprobante ni entradas).
 * Si la venta no tiene covers no imprime nada.
 * En Android se envía directo a RawBT (sin vista previa).
 */
export async function printTicketSale(
  data: TicketSalePrintData,
  paperWidth: PaperWidth = "80mm",
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    if (!data.coverTokens.length) return { success: true, skipped: true };

    if (isAndroid()) {
      window.location.assign(
        `intent:base64,${buildCoversRawBtPayload(data)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`,
      );
      return { success: true };
    }

    const css = buildCss(paperWidth);
    let lastError: string | undefined;
    let anySuccess = false;
    for (const cover of data.coverTokens) {
      const result = await printOneDocument(buildCoverHtml(data, cover, paperWidth), css);
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
