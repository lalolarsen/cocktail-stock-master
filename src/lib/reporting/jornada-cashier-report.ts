/**
 * Imprime el reporte de cajero (resultados de jornada) usando impresión HTML
 * con el mismo formato que los tickets QR (80mm @page) para garantizar centrado
 * y que no se corte el contenido en impresoras térmicas.
 */
import { formatCLP } from "@/lib/currency";
import { calculateCommission, STOCKIA_COMMISSION_RATE } from "@/lib/commission";

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
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function downloadCashierReport(data: CashierReportData): void {
  const commission = calculateCommission(data.grandTotal);
  const ratePct = (STOCKIA_COMMISSION_RATE * 100).toFixed(1).replace(/\.0$/, "");

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

    <div class="row" style="margin-top:6px;">
      <span class="lbl">Comisión STOCKIA (${ratePct}%)</span>
      <span class="val">${formatCLP(commission)}</span>
    </div>
    <hr />

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
