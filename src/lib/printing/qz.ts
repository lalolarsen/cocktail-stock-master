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
}

// ── HTML receipt builder ──

/**
 * Builds the print CSS with a paper-specific @page size rule.
 * When Chrome is launched with --kiosk-printing, the @page size is used
 * to send directly to the printer at the correct width (no dialog shown).
 */
function buildReceiptCss(paperWidth: PaperWidth): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; }
    .receipt { width: 100%; padding: 0 2px; }
    .venue-name { font-size: 14pt; font-weight: bold; margin-bottom: 4px; text-align: center; }
    .sep { margin: 3px 0; white-space: pre; text-align: center; }
    .meta { text-align: center; font-size: 9pt; }
    .items { width: 100%; border-collapse: collapse; margin: 6px 0; }
    .items td { padding: 1px 0; vertical-align: top; font-size: 9.5pt; }
    .item-name { text-align: left; }
    .item-price { text-align: right; white-space: nowrap; padding-left: 4px; }
    .total-line { font-size: 13pt; font-weight: bold; text-align: right; margin: 4px 0; }
    .payment { text-align: center; margin: 4px 0; font-size: 9.5pt; }
    .token-section { text-align: center; margin: 8px 0; }
    .token-label { font-weight: bold; }
    .token-value { font-size: 9pt; word-break: break-all; }
    .footer { text-align: center; margin-top: 10px; font-size: 9.5pt; }
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

  const tokenHtml = data.pickupToken
    ? `<div class="token-section">
        <div class="sep">${dash}</div>
        <div class="token-label">--- CANJE QR ---</div>
        <div class="token-value">Token: ${data.pickupToken}</div>
      </div>`
    : "";

  const paymentLabel = data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta";

  return `
    <div class="receipt">
      <div class="venue-name">${data.venueName}</div>
      <div class="sep">${sep}</div>
      <div class="meta">Venta: ${data.saleNumber}</div>
      <div class="meta">POS: ${data.posName}</div>
      <div class="meta">${data.dateTime}</div>
      <div class="sep">${sep}</div>
      <table class="items"><tbody>${itemsHtml}</tbody></table>
      <div class="sep">${dash}</div>
      <div class="total-line">TOTAL: $${data.total.toLocaleString("es-CL")}</div>
      <div class="payment">Pago: ${paymentLabel}</div>
      ${tokenHtml}
      <div class="footer">Gracias por tu compra</div>
    </div>
  `;
}

// ── Main print function ──

/**
 * Print a receipt via print-js (browser print dialog or kiosk-silent).
 *
 * Fire-and-forget: resolves immediately after dispatching the print command.
 * This works correctly in both modes:
 *   - Normal mode: the browser print dialog opens; user clicks Print.
 *   - Chrome --kiosk-printing: no dialog; prints silently to default printer.
 *
 * The `printerName` parameter is kept for API compatibility but is ignored –
 * printer selection is done in the browser dialog (or via OS default in kiosk).
 */
export function printRaw(
  _printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = buildReceiptHtml(data, paperWidth);
    const css = buildReceiptCss(paperWidth);

    printJS({
      printable: html,
      type: "raw-html",
      style: css,
      onError: (err: any) => console.error("[PrintJS] Error:", err),
    });

    return Promise.resolve({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de impresión";
    console.error("[PrintJS] Error:", error);
    return Promise.resolve({ success: false, error: message });
  }
}
