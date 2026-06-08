/**
 * Physical "cover" print for courtesy items. Replaces the old QR ticket.
 * Designed for 80mm receipt printers via window.print() popup.
 */
export interface CourtesyCoverData {
  productName: string;
  qty: number;
  code: string;              // kept as visible audit reference (no QR)
  note?: string | null;
  expiresAt?: string | null; // ISO
  createdAt?: string | null; // ISO
}

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function printCourtesyCover(data: CourtesyCoverData): void {
  const w = window.open("", "_blank", "width=380,height=700");
  if (!w) {
    // eslint-disable-next-line no-console
    console.warn("[CourtesyCover] popup blocked");
    return;
  }
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cortesía</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; color: #000 !important; }
      body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; margin: 0; padding: 6px 4px; width: 72mm; text-align: center; }
      .brand { font-size: 11px; letter-spacing: 3px; font-weight: 700; }
      .tag { display: inline-block; margin: 8px 0 6px; padding: 6px 14px; border: 3px solid #000; border-radius: 6px; font-size: 18px; font-weight: 900; letter-spacing: 2px; }
      .amount { font-size: 22px; font-weight: 900; margin: 2px 0 8px; }
      .product { font-size: 26px; font-weight: 900; line-height: 1.1; margin: 10px 4px 4px; word-wrap: break-word; }
      .qty { font-size: 20px; font-weight: 800; margin: 2px 0 10px; }
      .sep { border-top: 2px dashed #000; margin: 8px 0; }
      .note { font-style: italic; font-size: 13px; margin: 6px 4px; word-wrap: break-word; }
      .code { font-family: "Courier New", monospace; font-size: 12px; letter-spacing: 2px; margin-top: 8px; }
      .meta { font-size: 10px; color: #333; margin-top: 4px; }
      .footer { font-size: 11px; font-weight: 700; margin-top: 10px; letter-spacing: 1px; }
    </style></head><body>
    <div class="brand">STOCKIA</div>
    <div class="tag">CORTESÍA</div>
    <div class="amount">$0</div>
    <div class="sep"></div>
    <div class="product">${safe(data.productName)}</div>
    <div class="qty">× ${data.qty}</div>
    <div class="sep"></div>
    ${data.note ? `<div class="note">"${safe(data.note)}"</div>` : ""}
    <div class="meta">${data.createdAt ? "Emitido: " + fmtFull(data.createdAt) : ""}</div>
    ${data.expiresAt ? `<div class="meta">Válido hasta: ${fmtFull(data.expiresAt)}</div>` : ""}
    <div class="code">Ref: ${safe(data.code)}</div>
    <div class="footer">ENTREGAR EN BARRA</div>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);};</script>
  </body></html>`);
  w.document.close();
}
