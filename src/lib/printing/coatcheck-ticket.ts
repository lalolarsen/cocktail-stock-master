/**
 * Guardarropía: imprime dos tickets con el mismo número.
 * - Copia CLIENTE (se entrega a la persona)
 * - Copia PRENDA (se pincha en la prenda)
 * Diseñado para impresoras térmicas de 80mm vía window.print().
 */
export interface CoatcheckTicketData {
  ticketNumber: number;
  garmentCount: number;
  amount: number;
  paymentMethod: string;
  issuedAt?: string | null;
  note?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  debit: "Tarjeta",
  credit: "Tarjeta",
  transfer: "Transferencia",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

const safe = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function copyHtml(data: CoatcheckTicketData, kind: "CLIENTE" | "PRENDA"): string {
  return `
    <div class="copy">
      <div class="brand">STOCKIA · GUARDARROPÍA</div>
      <div class="kind">COPIA ${kind}</div>
      <div class="number">${data.ticketNumber}</div>
      <div class="row">Prendas: <b>${data.garmentCount}</b></div>
      ${kind === "CLIENTE"
        ? `<div class="row">Pagado: <b>${clp(data.amount)}</b> · ${safe(PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod)}</div>`
        : ""}
      ${data.note ? `<div class="note">${safe(data.note)}</div>` : ""}
      <div class="meta">${data.issuedAt ? fmtTime(data.issuedAt) : ""}</div>
      <div class="footer">${kind === "CLIENTE" ? "CONSERVE ESTE TICKET PARA RETIRAR" : "PINCHAR EN LA PRENDA"}</div>
    </div>`;
}

export function printCoatcheckTicket(data: CoatcheckTicketData): void {
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
