/**
 * Printing module – browser-based via print-js.
 *
 * STOCKIA POS (post-QR pivot): cada venta imprime DOS piezas físicas
 *   1) COVER del cliente — formato grande, detalle de productos legible.
 *   2) COMPROBANTE del vendedor — ticket compacto con total y método de pago.
 *
 * Ya no se genera ni se imprime ningún QR. El cover físico ES la evidencia
 * que el cliente entrega al staff.
 *
 * Exported names are kept compatible with the old QZ module so callers
 * don't need import changes.
 */

import printJS from "print-js";
import { STOCKIA_PRINT_FOOTER } from "@/lib/commission";

export type PaperWidth = "58mm" | "80mm";

// ── Storage key helpers (unchanged) ──

const LEGACY_PRINTER_KEY = "stockia_printer_name";
const LEGACY_PAPER_WIDTH_KEY = "stockia_paper_width";

export function getPreferredPrinterStorageKey(venueId?: string, posId?: string): string {
  if (venueId && posId) return `preferred_printer:${venueId}:${posId}`;
  return LEGACY_PRINTER_KEY;
}

export function getPreferredPaperWidthStorageKey(venueId?: string, posId?: string): string {
  if (venueId && posId) return `preferred_paper_width:${venueId}:${posId}`;
  return LEGACY_PAPER_WIDTH_KEY;
}

// ── Compatibility stubs (no connection required with print-js) ──

/** Always true – print-js needs no external connection. */
export async function isQZConnected(): Promise<boolean> {
  return true;
}

// ── Warm-up: ensure the print-js iframe exists before the first real print ──
let _printWarmupDone = false;
export function warmupPrintJs(): void {
  if (typeof window === "undefined" || _printWarmupDone) return;
  _printWarmupDone = true;
  try {
    const existing = document.getElementById("printJS") as HTMLIFrameElement | null;
    if (existing) return;
    const iframe = document.createElement("iframe");
    iframe.id = "printJS";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    iframe.srcdoc = "<!doctype html><html><body></body></html>";
    document.body.appendChild(iframe);
  } catch (err) {
    console.warn("[PrintJS] warmup failed", err);
  }
}

// ── Receipt data ──

export interface ReceiptData {
  saleNumber: string;
  venueName: string;
  posName: string;
  dateTime: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  paymentMethod: string;
  /** @deprecated Sin QR. Se mantiene para compatibilidad de tipo; se ignora. */
  pickupToken?: string;
  /** @deprecated Sin QR. Se mantiene para compatibilidad de tipo; se ignora. */
  shortCode?: string;
  /** Nombre del vendedor para imprimir en el comprobante */
  sellerName?: string;
  /** Marca de cortesía – cambia título y oculta total/pago */
  isCourtesy?: boolean;
  /** Motivo de cortesía (opcional) */
  courtesyReason?: string;
}

/** Fixed venue title for all receipts */
const RECEIPT_VENUE_TITLE = "Berlín Valdivia";

const SEP = {
  "58mm": "================================",
  "80mm": "================================================",
} as const;
const DASH = {
  "58mm": "--------------------------------",
  "80mm": "------------------------------------------------",
} as const;

// ── Builders ──

/**
 * COVER del cliente — tipografía grande, detalle legible a distancia.
 * Pieza que el cliente entrega físicamente al staff.
 */
export function buildCoverHtml(data: ReceiptData, paperWidth: PaperWidth): string {
  const sep = SEP[paperWidth];
  const dash = DASH[paperWidth];

  const itemsHtml = data.items
    .map(
      (item) => `
        <div class="cover-item">
          <span class="cover-qty">${item.quantity}×</span>
          <span class="cover-name">${item.name}</span>
        </div>`,
    )
    .join("");

  const titleLabel = data.isCourtesy ? "CORTESÍA" : "COVER";
  const courtesyTag = data.isCourtesy
    ? `<div class="courtesy-stamp">CORTESÍA · $0</div>${
        data.courtesyReason
          ? `<div class="courtesy-reason">Motivo: ${data.courtesyReason}</div>`
          : ""
      }`
    : "";

  return `
    <div class="receipt cover">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="cover-kind">${titleLabel}</div>
      <div class="cover-sale">Venta N° ${data.saleNumber}</div>
      <div class="cover-datetime">${data.dateTime}</div>
      <div class="sep">${dash}</div>
      ${courtesyTag}
      <div class="cover-items">${itemsHtml}</div>
      <div class="sep">${dash}</div>
      <div class="cover-footer">Entrega este comprobante al staff</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

/**
 * COMPROBANTE del vendedor — ticket compacto, queda como respaldo del cajero.
 */
export function buildCashierReceiptHtml(data: ReceiptData, paperWidth: PaperWidth): string {
  const sep = SEP[paperWidth];
  const dash = DASH[paperWidth];

  const itemsHtml = data.items
    .map(
      (item) =>
        `<div class="item-line">${item.quantity}x ${item.name} $${item.price.toLocaleString("es-CL")}</div>`,
    )
    .join("");

  const paymentLabel = data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta";
  const sellerLine = data.sellerName ? `<div class="meta">Vendedor: ${data.sellerName}</div>` : "";

  const totalsBlock = data.isCourtesy
    ? `<div class="total-line">CORTESÍA · $0</div>`
    : `
        <div class="total-line">TOTAL: $${data.total.toLocaleString("es-CL")}</div>
        <div class="payment">Pago: ${paymentLabel}</div>`;

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="meta">${data.posName}</div>
      <div class="meta">Venta: ${data.saleNumber}</div>
      <div class="meta">${data.dateTime}</div>
      ${sellerLine}
      <div class="sep">${sep}</div>
      <div class="items-list">${itemsHtml}</div>
      <div class="sep">${dash}</div>
      ${totalsBlock}
      <div class="footer">${data.isCourtesy ? "Cortesía registrada" : "Comprobante del vendedor"}</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

// ── CSS ──

export function buildCashierReceiptCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 0 2px; padding-bottom: 40mm; color: #000; }
    .venue-name { font-size: 16pt; font-weight: bold; margin-bottom: 4px; text-align: center; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; }
    .meta { text-align: center; font-size: 11pt; }
    .items-list { margin: 6px 0; }
    .item-line { font-size: 14pt; font-weight: bold; padding: 2px 0; }
    .total-line { font-size: 15pt; font-weight: bold; text-align: right; margin: 4px 0; }
    .payment { text-align: center; margin: 4px 0; font-size: 11pt; }
    .footer { text-align: center; margin-top: 10px; font-size: 11pt; }
    .stockia-footer { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 2px solid #000; font-size: 11pt; font-weight: 900; letter-spacing: 0.3px; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

export function buildCoverCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12pt; color: #000; background: #fff; }
    .receipt.cover { width: 100%; padding: 4px 4px 40mm; }
    .venue-name { font-size: 18pt; font-weight: 900; text-align: center; margin-bottom: 6px; }
    .sep { margin: 4px 0; white-space: pre; text-align: center; font-size: 9pt; }
    .cover-kind { text-align: center; font-size: 28pt; font-weight: 900; letter-spacing: 6px; margin: 8px 0 6px; padding: 6px 0; border-top: 3px solid #000; border-bottom: 3px solid #000; }
    .cover-sale { text-align: center; font-size: 14pt; font-weight: bold; margin-top: 6px; }
    .cover-datetime { text-align: center; font-size: 12pt; margin-bottom: 4px; }
    .courtesy-stamp { text-align: center; font-size: 22pt; font-weight: 900; padding: 6px; border: 3px solid #000; margin: 8px 0; letter-spacing: 3px; }
    .courtesy-reason { text-align: center; font-size: 12pt; font-style: italic; margin-bottom: 6px; }
    .cover-items { margin: 10px 0; }
    .cover-item { display: flex; align-items: baseline; gap: 8px; padding: 6px 0; border-bottom: 1px dashed #000; }
    .cover-qty { font-size: 26pt; font-weight: 900; min-width: 60px; }
    .cover-name { font-size: 20pt; font-weight: bold; flex: 1; word-break: break-word; line-height: 1.15; }
    .cover-footer { text-align: center; margin-top: 12px; font-size: 12pt; font-weight: bold; }
    .stockia-footer { text-align: center; margin-top: 10px; padding-top: 6px; border-top: 2px solid #000; font-size: 11pt; font-weight: 900; letter-spacing: 0.3px; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

// ── Main print function (kept for compatibility) ──

/**
 * Print a receipt via print-js (browser print dialog or kiosk-silent).
 * Sin QR — imprime solo el comprobante del vendedor.
 */
export function printRaw(
  _printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
): Promise<{ success: boolean; error?: string }> {
  warmupPrintJs();
  try {
    const html = buildCashierReceiptHtml(data, paperWidth);
    const css = buildCashierReceiptCss(paperWidth);

    printJS({
      printable: html,
      type: "raw-html",
      style: css,
      onError: (err: unknown) => console.error("[PrintJS] Error:", err),
    });

    return Promise.resolve({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de impresión";
    console.error("[PrintJS] Error:", error);
    return Promise.resolve({ success: false, error: message });
  }
}

// ── Sale documents coordinator ──

/**
 * Print one HTML document via a dedicated, freshly-created hidden iframe.
 * Cada llamada usa su propio iframe para evitar que Chrome/kiosk descarte
 * impresiones encadenadas sobre el iframe compartido de print-js.
 */
export function printOneDocument(html: string, css: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve({ success: false, error: "No window" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: { success: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      try { iframe.parentNode?.removeChild(iframe); } catch { /* ignore */ }
      resolve(result);
    };

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";

    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`;

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          done({ success: false, error: "iframe sin contentWindow" });
          return;
        }
        const onAfterPrint = () => {
          win.removeEventListener("afterprint", onAfterPrint);
          setTimeout(() => done({ success: true }), 250);
        };
        win.addEventListener("afterprint", onAfterPrint);
        setTimeout(() => done({ success: true }), 8000);

        win.focus();
        win.print();
      } catch (err) {
        console.error("[Print] Error:", err);
        done({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    };

    iframe.srcdoc = doc;
    document.body.appendChild(iframe);
  });
}

/**
 * Imprime las DOS piezas de una venta POS:
 *   1) COVER del cliente (formato grande)
 *   2) COMPROBANTE del vendedor (formato compacto)
 *
 * El parámetro `isHybrid` se mantiene por compatibilidad pero ya no
 * afecta el flujo (sin QR no hay diferencia entre POS normal e híbrido).
 */
export async function printSaleDocuments(
  _printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
  _isHybrid: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  const coverHtml = buildCoverHtml(data, paperWidth);
  const coverCss = buildCoverCss(paperWidth);

  const receiptHtml = buildCashierReceiptHtml(data, paperWidth);
  const receiptCss = buildCashierReceiptCss(paperWidth);

  // 1) Cover del cliente
  const coverResult = await printOneDocument(coverHtml, coverCss);

  // 2) Comprobante del vendedor
  const receiptResult = await printOneDocument(receiptHtml, receiptCss);

  if (!coverResult.success && !receiptResult.success) {
    return { success: false, error: coverResult.error || receiptResult.error };
  }
  if (!coverResult.success) return coverResult;
  if (!receiptResult.success) return receiptResult;
  return { success: true };
}
