/**
 * Printing module – browser-based via print-js.
 *
 * Replaces the QZ Tray integration.
 * No desktop application required – uses the browser's native print dialog.
 *
 * Exported names are kept compatible with the old QZ module so callers
 * don't need import changes.
 */

import printJS from "print-js";
import { generateQRSvgString } from "./qr-svg";
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
// Without this, the first POS sale frequently fails to trigger the print
// dialog because print-js creates its iframe lazily and the browser misses
// the first `onload` → `print()` sequence.
let _printWarmupDone = false;
export function warmupPrintJs(): void {
  if (typeof window === "undefined" || _printWarmupDone) return;
  _printWarmupDone = true;
  try {
    // Pre-create the iframe print-js looks for (id="printJS"). If absent,
    // print-js creates one on demand which is exactly the timing we want
    // to avoid on the first sale of a session.
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
  pickupToken?: string;
  shortCode?: string;
}

/** Fixed venue title for all receipts */
const RECEIPT_VENUE_TITLE = "Berlín Valdivia";

// ── HTML receipt builder ──

/**
 * Builds the print CSS with a paper-specific @page size rule.
 */
function buildReceiptCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 0 2px; padding-bottom: 40mm; color: #000; }
    .venue-name { font-size: 16pt; font-weight: bold; margin-bottom: 4px; text-align: center; color: #000; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; color: #000; }
    .meta { text-align: center; font-size: 11pt; color: #000; }
    .items { width: 100%; border-collapse: collapse; margin: 6px 0; }
    .items td { padding: 2px 0; vertical-align: top; font-size: 14pt; font-weight: bold; color: #000; }
    .item-name { text-align: left; color: #000; }
    .item-price { text-align: right; white-space: nowrap; padding-left: 4px; font-size: 14pt; font-weight: bold; color: #000; }
    .total-line { font-size: 15pt; font-weight: bold; text-align: right; margin: 4px 0; color: #000; }
    .payment { text-align: center; margin: 4px 0; font-size: 11pt; color: #000; }
    .qr-section { text-align: center; margin: 10px 0; }
    .qr-section svg { display: inline-block; max-width: 90%; height: auto; }
    .qr-label { font-size: 13pt; font-weight: bold; margin-bottom: 4px; color: #000; }
    .qr-instruction { font-size: 10pt; margin-top: 6px; padding: 6px; border: 1px dashed #000; color: #000; }
    .short-code { text-align: center; margin-top: 8px; font-size: 22pt; font-weight: bold; letter-spacing: 6px; color: #000; }
    .short-code-label { text-align: center; font-size: 11pt; color: #000; margin-top: 2px; }
    .footer { text-align: center; margin-top: 10px; font-size: 11pt; color: #000; }
    .stockia-footer { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 2px solid #000; font-size: 11pt; font-weight: 900; color: #000; letter-spacing: 0.3px; }
    .print-break { break-before: page; page-break-before: always; height: 0; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

function buildReceiptHtml(data: ReceiptData, paperWidth: PaperWidth): string {
  const sep58 = "================================";
  const sep80 = "================================================";
  const dash58 = "--------------------------------";
  const dash80 = "------------------------------------------------";

  const sep = paperWidth === "58mm" ? sep58 : sep80;
  const dash = paperWidth === "58mm" ? dash58 : dash80;

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td class="item-name">${item.quantity}x ${item.name}</td>
        <td class="item-price">$${item.price.toLocaleString("es-CL")}</td>
      </tr>`,
    )
    .join("");

  // Generate QR code SVG if pickup token exists
  let qrHtml = "";
  if (data.pickupToken) {
    const qrContent = `PICKUP:${data.pickupToken}`;
    const qrSize = paperWidth === "58mm" ? 220 : 280;
    const qrSvg = generateQRSvgString(qrContent, qrSize);
    qrHtml = `
      <div class="qr-section">
        <div class="sep">${dash}</div>
        <div class="qr-label">QR DE RETIRO</div>
        ${qrSvg}
        <div class="qr-instruction">
          Presenta este QR en la barra
        </div>
      </div>`;
  }

  const paymentLabel = data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta";

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="meta">Venta: ${data.saleNumber}</div>
      <div class="meta">${data.dateTime}</div>
      <div class="sep">${sep}</div>
      <table class="items"><tbody>${itemsHtml}</tbody></table>
      <div class="sep">${dash}</div>
      <div class="total-line">TOTAL: $${data.total.toLocaleString("es-CL")}</div>
      <div class="payment">Pago: ${paymentLabel}</div>
      ${qrHtml}
      <div class="footer">Gracias por tu compra</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

// ── QR-only ticket builder ──

function buildQrOnlyHtml(data: ReceiptData, paperWidth: PaperWidth): string {
  const sep = paperWidth === "58mm"
    ? "================================"
    : "================================================";

  if (!data.pickupToken) return "";

  const qrContent = `PICKUP:${data.pickupToken}`;
  const qrSize = paperWidth === "58mm" ? 220 : 280;
  const qrSvg = generateQRSvgString(qrContent, qrSize);

  const itemsHtml = data.items
    .map((item) => `<div style="font-size:14pt;font-weight:bold;color:#000;padding:2px 0;">${item.quantity}x ${item.name}</div>`)
    .join("");

  return `
    <div class="receipt">
      <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
      <div class="sep">${sep}</div>
      <div class="meta">Venta: ${data.saleNumber}</div>
      <div style="margin:6px 0;">${itemsHtml}</div>
      <div class="qr-section">
        <div class="qr-label">QR DE RETIRO</div>
        ${qrSvg}
        <div class="qr-instruction">
          Presenta este QR en la barra
        </div>
      </div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

// ── Cashier receipt builder (no QR) ──

export function buildCashierReceiptHtml(data: ReceiptData, paperWidth: PaperWidth): string {
  const sep = paperWidth === "58mm"
    ? "================================"
    : "================================================";
  const dash = paperWidth === "58mm"
    ? "--------------------------------"
    : "------------------------------------------------";

  const itemsHtml = data.items
    .map(
      (item) => `<div class="item-line">${item.quantity}x ${item.name} $${item.price.toLocaleString("es-CL")}</div>`,
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
      <div class="items-list">${itemsHtml}</div>
      <div class="sep">${dash}</div>
      <div class="total-line">TOTAL: $${data.total.toLocaleString("es-CL")}</div>
      <div class="payment">Pago: ${paymentLabel}</div>
      <div class="footer">Gracias por tu compra</div>
      <div class="stockia-footer">${STOCKIA_PRINT_FOOTER}</div>
    </div>
  `;
}

export function buildCashierReceiptCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; color: #000 !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; }
    .receipt { width: 100%; padding: 0 2px; padding-bottom: 40mm; color: #000; }
    .venue-name { font-size: 16pt; font-weight: bold; margin-bottom: 4px; text-align: center; color: #000; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; color: #000; }
    .meta { text-align: center; font-size: 11pt; color: #000; }
    .items-list { margin: 6px 0; }
    .item-line { font-size: 14pt; font-weight: bold; color: #000; padding: 2px 0; }
    .total-line { font-size: 15pt; font-weight: bold; text-align: right; margin: 4px 0; color: #000; }
    .payment { text-align: center; margin: 4px 0; font-size: 11pt; color: #000; }
    .footer { text-align: center; margin-top: 10px; font-size: 11pt; color: #000; }
    .stockia-footer { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 2px solid #000; font-size: 11pt; font-weight: 900; color: #000; letter-spacing: 0.3px; }
    @media print {
      @page { margin: 0; size: ${paperWidth} auto; }
      body { margin: 2mm; }
    }
  `;
}

// ── Main print function (kept for compatibility) ──

/**
 * Print a receipt via print-js (browser print dialog or kiosk-silent).
 */
export function printRaw(
  _printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
): Promise<{ success: boolean; error?: string }> {
  warmupPrintJs();
  try {
    const html = buildReceiptHtml(data, paperWidth);
    const css = buildReceiptCss(paperWidth);

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

export function printOneDocument(html: string, css: string): Promise<{ success: boolean; error?: string }> {
  // Make sure the printJS iframe exists *before* we call printJS, otherwise
  // the very first print of the session is silently swallowed in some
  // browsers (no dialog appears, no error).
  warmupPrintJs();
  return new Promise((resolve) => {
    try {
      printJS({
        printable: html,
        type: "raw-html",
        style: css,
        onError: (err: unknown) => {
          console.error("[PrintJS] Error:", err);
          resolve({ success: false, error: String(err) });
        },
      });
      resolve({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de impresión";
      resolve({ success: false, error: message });
    }
  });
}

/**
 * Print sale documents as a single browser job.
 * - Normal POS (pickupToken present, not hybrid): QR ticket + cashier receipt in one print dialog
 * - Hybrid POS (or no pickupToken): cashier receipt only
 *
 * Chrome/Windows can suppress chained print dialogs when the second call is no
 * longer considered user-initiated. Combining both pieces prevents cajas from
 * printing only the receipt and dropping the QR.
 */
export async function printSaleDocuments(
  _printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
  isHybrid: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  warmupPrintJs();
  const hasQr = !!data.pickupToken && !isHybrid;
  const css = buildReceiptCss(paperWidth);
  const receiptHtml = buildCashierReceiptHtml(data, paperWidth);

  if (!hasQr) {
    return printOneDocument(receiptHtml, buildCashierReceiptCss(paperWidth));
  }

  const qrHtml = buildQrOnlyHtml(data, paperWidth);
  return printOneDocument(`${qrHtml}<div class="print-break"></div>${receiptHtml}`, css);
}
