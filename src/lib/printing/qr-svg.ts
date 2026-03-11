/**
 * Generate a QR code as an inline SVG string (no React dependency).
 * Uses ReactDOMServer + QRCodeSVG from qrcode.react for consistency.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

/**
 * Returns a self-contained SVG string for the given value.
 * Ready to embed in raw HTML (print receipts, etc.).
 */
export function generateQRSvgString(
  value: string,
  size: number = 200,
): string {
  const element = createElement(QRCodeSVG, {
    value,
    size,
    level: "H",
    includeMargin: true,
    bgColor: "#ffffff",
    fgColor: "#000000",
  });
  return renderToStaticMarkup(element);
}
