/**
 * STOCKIA — Comisión por venta
 *
 * Tasa fija aplicada sobre las ventas brutas (alcohol + tickets) del venue.
 * Es informativa: se utiliza para emitir las facturas semanales de STOCKIA al cliente.
 * NO descuenta del efectivo a entregar ni afecta el cierre operacional de la jornada.
 */

export const STOCKIA_COMMISSION_RATE = 0.025; // 2.5%

export const STOCKIA_COMMISSION_LABEL = "Comisión STOCKIA";

export const STOCKIA_PRINT_FOOTER =
  "Estás utilizando STOCKIA, el estándar del control nocturno";

/** Calcula la comisión informativa sobre un total bruto en CLP (entero). */
export function calculateCommission(grossAmount: number): number {
  if (!grossAmount || grossAmount <= 0) return 0;
  return Math.round(grossAmount * STOCKIA_COMMISSION_RATE);
}
