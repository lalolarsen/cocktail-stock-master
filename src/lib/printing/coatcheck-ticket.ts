/**
 * Guardarropía: imprime dos tickets con el mismo número.
 * - Copia CLIENTE (se entrega a la persona)
 * - Copia PRENDA (se pincha en la prenda / bolso)
 * En Android envía ESC/POS directo a RawBT (sin vista previa).
 */
export type CoatcheckItemType = "backpack" | "garment";

export interface CoatcheckTicketData {
  ticketNumber: number;
  garmentCount: number;
  amount: number;
  paymentMethod: string;
  itemType: CoatcheckItemType;
  issuedAt?: string | null;
  note?: string | null;
  jornadaName?: string | null;
  jornadaNumber?: number | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  debit: "Tarjeta",
  credit: "Tarjeta",
  transfer: "Transferencia",
};

export const ITEM_LABELS: Record<CoatcheckItemType, string> = {
  backpack: "Mochila / bolso",
  garment: "Prenda de ropa",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

const safe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

function buildRawBtPayload(data: CoatcheckTicketData): string {
  const encoder = new TextEncoder();
  const text = (value: string) => Array.from(encoder.encode(ascii(value)));
  const bytes: number[] = [0x1b, 0x40, 0x1b, 0x61, 0x01];

  const copy = (kind: "CLIENTE" | "PRENDA") => {
    bytes.push(
      ...text("BERLIN VALDIVIA\n"),
      0x1b, 0x45, 0x01,
      ...text("GUARDARROPIA\n"),
      ...text(`COPIA ${kind}\n`),
      0x1b, 0x45, 0x00,
      ...text("--------------------------------\n"),
      0x1d, 0x21, 0x22,
      ...text(`${data.ticketNumber}\n`),
      0x1d, 0x21, 0x00,
      ...text(`${data.garmentCount} x ${ITEM_LABELS[data.itemType]}\n`),
    );
    if (kind === "CLIENTE") {
      bytes.push(
        ...text(`${clp(data.amount)} - ${PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}\n`),
      );
    }
    if (data.jornadaNumber) bytes.push(...text(`Jornada #${data.jornadaNumber}\n`));
    if (data.jornadaName) bytes.push(...text(`${data.jornadaName}\n`));
    if (data.note) bytes.push(...text(`${data.note}\n`));
    if (data.issuedAt) bytes.push(...text(`${fmtTime(data.issuedAt)}\n`));
    bytes.push(
      0x1b, 0x45, 0x01,
      ...text(kind === "CLIENTE" ? "CONSERVE ESTE TICKET\n" : "PINCHAR EN LA PRENDA\n"),
      0x1b, 0x45, 0x00,
      ...text("\n"),
    );
  };

  copy("CLIENTE");
  bytes.push(...text("--------------------------------\n"));
  copy("PRENDA");
  bytes.push(...text("\n\n"), 0x1d, 0x56, 0x42, 0x00);

  return bytesToBase64(bytes);
}

function copyHtml(data: CoatcheckTicketData, kind: "CLIENTE" | "PRENDA"): string {
  return `
    <div class="copy">
      <div class="brand">STOCKIA · GUARDARROPÍA</div>
      <div class="kind">COPIA ${kind}</div>
      <div class="number">${data.ticketNumber}</div>
      <div class="row"><b>${data.garmentCount} × ${ITEM_LABELS[data.itemType]}</b></div>
      ${
        kind === "CLIENTE"
          ? `<div class="row">Pagado: <b>${clp(data.amount)}</b> · ${safe(
              PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod,
            )}</div>`
          : ""
      }
      ${data.jornadaNumber ? `<div class="row">Jornada #${data.jornadaNumber}</div>` : ""}
      ${data.jornadaName ? `<div class="row">${safe(data.jornadaName)}</div>` : ""}
      ${data.note ? `<div class="note">${safe(data.note)}</div>` : ""}
      <div class="meta">${data.issuedAt ? fmtTime(data.issuedAt) : ""}</div>
      <div class="footer">${kind === "CLIENTE" ? "CONSERVE ESTE TICKET PARA RETIRAR" : "PINCHAR EN LA PRENDA"}</div>
    </div>`;
}

function printWithBrowser(data: CoatcheckTicketData): void {
  const w = window.open("", "_blank", "width=380,height=800");
  if (!w) {
    // eslint-disable-next-line no-console
    console.warn("[CoatcheckTicket] popup blocked");
    return;
  }

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Guardarropía ${data.ticketNumber}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; color: #000 !important; }
      body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; margin: 0; padding: 6px 4px; width: 72mm; text-align: center; }
      .copy { padding: 6px 0 10px; }
      .copy + .copy { border-top: 2px dashed #000; margin-top: 10px; }
      .brand { font-size: 10px; letter-spacing: 2px; font-weight: 700; }
      .kind { font-size: 12px; font-weight: 800; letter-spacing: 2px; margin-top: 4px; }
      .number { font-size: 72px; font-weight: 900; line-height: 1; margin: 6px 0 8px; }
      .row { font-size: 14px; margin: 2px 0; }
      .note { font-style: italic; font-size: 12px; margin: 4px 6px; word-wrap: break-word; }
      .meta { font-size: 10px; color: #333; margin-top: 4px; }
      .footer { font-size: 11px; font-weight: 700; margin-top: 8px; letter-spacing: 1px; }
    </style></head><body>
    ${copyHtml(data, "CLIENTE")}
    ${copyHtml(data, "PRENDA")}
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);};</script>
  </body></html>`);
  w.document.close();
}

export function printCoatcheckTicket(data: CoatcheckTicketData): void {
  if (isAndroid()) {
    window.location.assign(
      `intent:base64,${buildRawBtPayload(data)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`,
    );
    return;
  }
  printWithBrowser(data);
}
