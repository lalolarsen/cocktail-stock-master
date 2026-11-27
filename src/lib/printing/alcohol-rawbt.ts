import type { ReceiptData } from "./qz";

/** One RawBT intent contains both pieces; opening Android twice loses the second. */
export function buildAlcoholRawBtPayload(data: ReceiptData, receiptOnly = false): string {
  const bytes: number[] = [0x1b, 0x40];
  const text = (value: string) => {
    const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "");
    bytes.push(...new TextEncoder().encode(ascii));
  };
  const center = () => bytes.push(0x1b, 0x61, 0x01);
  const bold = (on: boolean) => bytes.push(0x1b, 0x45, on ? 1 : 0);
  const cut = () => bytes.push(0x1b, 0x64, 0x05, 0x1d, 0x56, 0x42, 0x00);
  const meta = () => {
    text(`Venta N ${data.saleNumber}\n${data.dateTime}\n`);
    if (data.jornadaNumber) text(`JORNADA #${data.jornadaNumber}\n`);
    if (data.jornadaName) text(`${data.jornadaName}\n`);
  };
  center();
  if (!receiptOnly) {
    bold(true); text("BERLIN VALDIVIA\n");
    bytes.push(0x1d, 0x21, 0x11); text(data.isCourtesy ? "CORTESIA\n" : "COVER\n"); bytes.push(0x1d, 0x21, 0x00);
    meta(); text("VALIDO SOLO ESTA JORNADA\n--------------------------------\n");
    for (const item of data.items) {
      bytes.push(0x1d, 0x21, 0x11); text(`${item.quantity} x ${item.name}\n`); bytes.push(0x1d, 0x21, 0x00);
    }
    text("--------------------------------\nENTREGAR EN BARRA\n"); bold(false); cut();
  }
  center(); bold(true); text("BERLIN VALDIVIA\nCOMPROBANTE DEL VENDEDOR\n"); bold(false);
  text(`${data.posName}\n`); meta();
  if (data.sellerName) text(`Vendedor: ${data.sellerName}\n`);
  text("--------------------------------\n");
  bytes.push(0x1b, 0x61, 0x00);
  for (const item of data.items) text(`${item.quantity} x ${item.name} $${Math.round(item.price).toLocaleString("es-CL")}\n`);
  bold(true); text(`TOTAL: $${Math.round(data.total).toLocaleString("es-CL")}\n`); bold(false);
  text(`Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}\n`);
  cut();
  return btoa(bytes.map((byte) => String.fromCharCode(byte)).join(""));
}