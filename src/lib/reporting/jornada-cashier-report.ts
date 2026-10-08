import { sendToRawBt } from "@/lib/printing/rawbt";
import { dismissFallback, showManualFallback } from "@/lib/printing/print-tracker";
/**
 * Imprime el reporte de cajero (resultados de jornada) usando impresión HTML
 * con el mismo formato que los tickets QR (80mm @page) para garantizar centrado
 * y que no se corte el contenido en impresoras térmicas.
 */
import { formatCLP } from "@/lib/currency";


export interface CashierReportData {
  venueName: string;
  posName: string;
  jornadaNumber: number;
  fecha: string;
  downloadTime: string;
  cashTotal: number;
  cashCount: number;
  cardTotal: number;
  cardCount: number;
  grandTotal: number;
  grandCount: number;
  extraLines?: { label: string; value: string }[];
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const ascii = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "");

const W = 32;
const line = (l: string, r: string) => {
  const a = ascii(l), b = ascii(r);
  const space = Math.max(1, W - a.length - b.length);
  return a.length + b.length + 1 > W ? `${a}\n${" ".repeat(Math.max(0, W - b.length))}${b}\n` : `${a}${" ".repeat(space)}${b}\n`;
};

function buildRawBtPayload(data: CashierReportData): string {
  const enc = new TextEncoder();
  const t = (s: string) => Array.from(enc.encode(ascii(s)));
  const sep = "--------------------------------\n";
  const B1 = [0x1b, 0x45, 0x01], B0 = [0x1b, 0x45, 0x00];
  const bytes: number[] = [0x1b, 0x40, 0x1b, 0x61, 0x01,
    ...B1, ...t("RESULTADOS JORNADA\n"), ...B0, ...t(sep),
    ...t(`${data.venueName}\n`), ...t(`Caja: ${data.posName}\n`),
    ...t(`Jornada #${data.jornadaNumber}\n`), ...t(`${data.fecha}\n`), ...t(sep),
    ...B1, ...t("RESUMEN FINANCIERO\n"), ...B0,
    0x1b, 0x61, 0x00, ...t(sep),
    ...t(line(`Efectivo (${data.cashCount})`, formatCLP(data.cashTotal))),
    ...t(line(`Tarjeta (${data.cardCount})`, formatCLP(data.cardTotal))),
    ...t(sep), ...B1, ...t(line("TOTAL", formatCLP(data.grandTotal))), ...B0,
    ...t(line("", `${data.grandCount} ventas`)), ...t(sep),
  ];
  if (data.extraLines?.length) {
    bytes.push(...B1, ...t("DETALLE\n"), ...B0);
    for (const l of data.extraLines) bytes.push(...t(line(l.label, l.value)));
    bytes.push(...t(sep));
  }
  bytes.push(
    ...t("\nFirma cajero:\n\n________________________________\n"),
    ...t("Nombre:\n\n________________________________\n"),
    ...t("RUT (opcional):\n\n________________________________\n\n"),
    0x1b, 0x61, 0x01, ...t(`Generado: ${data.downloadTime}\n`),
    0x1b, 0x64, 0x05, 0x1d, 0x56, 0x42, 0x00,
  );
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return window.btoa(bin);
}

export function downloadCashierReport(data: CashierReportData): void {
  if (/Android/i.test(navigator.userAgent)) {
    const payload = buildRawBtPayload(data);
    const send = async () => {
      const outcome = await sendToRawBt(payload);
      if (outcome === "not_sent") showManualFallback("Resumen de jornada", send);
      else dismissFallback();
    };
    void send();
    return;
  }


  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Jornada ${data.jornadaNumber} - ${escape(data.posName)}</title>
    <style>
      @page { size: 80mm auto; margin: 5mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: 'Courier New', Courier, monospace;
        color: #000;
        width: 70mm;
        margin: 0 auto;
        font-size: 11pt;
        line-height: 1.35;
      }
      .center { text-align: center; }
      .right { text-align: right; }
      .bold { font-weight: bold; }
      .title { font-size: 13pt; font-weight: bold; margin-bottom: 4px; }
      .section { font-size: 12pt; font-weight: bold; margin: 6px 0 4px; }
      hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }
      .row .lbl { flex: 1; text-align: left; }
      .row .val { text-align: right; white-space: nowrap; }
      .total-row { font-size: 13pt; font-weight: bold; margin-top: 6px; }
      .sign-block { margin-top: 14px; }
      .sign-line { border-bottom: 1px solid #000; height: 14px; margin: 4px 4mm 8px; }
      .footer { font-size: 8pt; text-align: center; margin-top: 10px; }
      @media print { body { width: 70mm; } }
    </style>
  </head>
  <body>
    <div class="center title">RESULTADOS JORNADA</div>
    <hr />
    <div class="center">${escape(data.venueName)}</div>
    <div class="center">Caja: ${escape(data.posName)}</div>
    <div class="center">Jornada #${data.jornadaNumber}</div>
    <div class="center">${escape(data.fecha)}</div>
    <hr />

    <div class="center section">RESUMEN FINANCIERO</div>
    <hr />
    <div class="row"><span class="lbl">Efectivo (${data.cashCount})</span><span class="val">${formatCLP(data.cashTotal)}</span></div>
    <div class="row"><span class="lbl">Tarjeta (${data.cardCount})</span><span class="val">${formatCLP(data.cardTotal)}</span></div>
    <hr />
    <div class="row total-row"><span class="lbl">TOTAL</span><span class="val">${formatCLP(data.grandTotal)}</span></div>
    <div class="right">${data.grandCount} ventas</div>
    <hr />
    ${data.extraLines?.length ? `<div class="center section">DETALLE</div><hr />${data.extraLines.map(l => `<div class="row"><span class="lbl">${escape(l.label)}</span><span class="val">${escape(l.value)}</span></div>`).join("")}<hr />` : ""}

    <div class="sign-block">
      <div>Firma cajero:</div>
      <div class="sign-line"></div>
      <div>Nombre:</div>
      <div class="sign-line"></div>
      <div>RUT (opcional):</div>
      <div class="sign-line"></div>
    </div>

    <div class="footer">Generado: ${escape(data.downloadTime)}</div>

    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.print();
          setTimeout(function () { window.close(); }, 400);
        }, 150);
      });
    </script>
  </body>
</html>`;

  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) {
    // Fallback: descargar como HTML si el popup está bloqueado
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jornada_${data.jornadaNumber}_${data.posName.replace(/\s+/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
