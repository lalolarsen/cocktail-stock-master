/**
 * Physical "cover" print for courtesy items. Replaces the old QR ticket.
 * On Android, sends ESC/POS directly to RawBT without opening print preview.
 * Other platforms retain the browser print fallback.
 */
export interface CourtesyCoverData {
  productName: string;
  qty: number;
  code: string;              // kept as visible audit reference (no QR)
  note?: string | null;
  expiresAt?: string | null; // ISO
  createdAt?: string | null; // ISO
  jornadaName?: string | null;
  jornadaNumber?: number | null;
}

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const isAndroid = () => /Android/i.test(navigator.userAgent);

const ascii = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "");

const bytesToBase64 = (bytes: number[]) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
};

function buildRawBtPayload(data: CourtesyCoverData): string {
  const encoder = new TextEncoder();
  const text = (value: string) => Array.from(encoder.encode(ascii(value)));
  const bytes: number[] = [
    0x1b, 0x40, // Initialize
    0x1b, 0x61, 0x01, // Center
    ...text("BERLIN VALDIVIA\n"),
    0x1b, 0x45, 0x01, // Bold on
    0x1d, 0x21, 0x11, // Double width + height
    ...text("CORTESIA\n"),
    0x1d, 0x21, 0x00,
    ...text("$0\n"),
    ...text("--------------------------------\n"),
    0x1b, 0x45, 0x01,
    ...text(data.jornadaNumber ? `JORNADA #${data.jornadaNumber}\n` : ""),
    ...text(data.jornadaName ? `${data.jornadaName}\n` : ""),
    0x1b, 0x45, 0x00,
    ...text("Valido solo esta jornada\n"),
    ...text("--------------------------------\n"),
    0x1d, 0x21, 0x11,
    ...text(`${data.qty} x ${data.productName}\n`),
    0x1d, 0x21, 0x00,
    ...text("--------------------------------\n"),
  ];

  if (data.note) bytes.push(...text(`Motivo: ${data.note}\n`));
  if (data.createdAt) bytes.push(...text(`Emitido: ${fmtFull(data.createdAt)}\n`));
  bytes.push(
    ...text(`Ref: ${data.code}\n`),
    0x1b, 0x45, 0x01,
    ...text("ENTREGAR EN BARRA\n"),
    0x1b, 0x45, 0x00,
    ...text("\n\n\n"),
    0x1d, 0x56, 0x42, 0x00, // Partial cut where supported
  );

  return bytesToBase64(bytes);
}

function printViaRawBt(data: CourtesyCoverData): void {
  const payload = buildRawBtPayload(data);
  const intent = `intent:base64,${payload}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  window.location.assign(intent);
}

function printWithBrowser(data: CourtesyCoverData): void {
  const w = window.open("", "_blank", "width=380,height=700");
  if (!w) {
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
      .jornada-num { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
      .jornada-name { font-size: 15px; font-weight: 700; }
      .jornada-warn { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
      .code { font-family: "Courier New", monospace; font-size: 12px; letter-spacing: 2px; margin-top: 8px; }
      .meta { font-size: 10px; color: #333; margin-top: 4px; }
      .footer { font-size: 11px; font-weight: 700; margin-top: 10px; letter-spacing: 1px; }
    </style></head><body>
    <div class="brand">STOCKIA</div>
    <div class="tag">CORTESÍA</div>
    <div class="amount">$0</div>
    <div class="sep"></div>
    ${data.jornadaNumber ? `<div class="jornada-num">JORNADA #${data.jornadaNumber}</div>` : ""}
    ${data.jornadaName ? `<div class="jornada-name">${safe(data.jornadaName)}</div>` : ""}
    <div class="jornada-warn">Válido solo esta jornada</div>
    <div class="sep"></div>
    <div class="product">${safe(data.productName)}</div>
    <div class="qty">× ${data.qty}</div>
    <div class="sep"></div>
    ${data.note ? `<div class="note">"${safe(data.note)}"</div>` : ""}
    <div class="meta">${data.createdAt ? "Emitido: " + fmtFull(data.createdAt) : ""}</div>
    <div class="code">Ref: ${safe(data.code)}</div>
    <div class="footer">ENTREGAR EN BARRA</div>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);};</script>
  </body></html>`);
  w.document.close();
}

export function printCourtesyCover(data: CourtesyCoverData): void {
  if (isAndroid()) {
    printViaRawBt(data);
    return;
  }
  printWithBrowser(data);
}
