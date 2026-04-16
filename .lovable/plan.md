
Plan confirmado — comisión informativa, sin afectar cierre de caja.

## 1. Constante centralizada
`src/lib/commission.ts` (nuevo): `STOCKIA_COMMISSION_RATE = 0.025` + `calculateCommission(gross)`.

## 2. Footer en QRs impresos (excluye cortesías)
- `src/lib/printing/qz.ts` — agregar línea "Estás utilizando STOCKIA, el estándar del control nocturno" en templates de venta/entrada/cover de alcohol.
- `src/lib/printing/ticket-print.ts` — misma línea en las 3 piezas (comprobante, entrada, cover).
- Reimpresiones heredan el footer al usar los mismos templates.
- Cortesías (`CourtesyRedeemDialog`, `CourtesyQR`) NO se modifican.

## 3. Reporte POS de jornada (PDF cierre cajero)
`src/lib/reporting/jornada-cashier-report.ts`: agregar bajo el TOTAL:
```
Comisión STOCKIA (2.5%): $XXX
```
Solo informativo. **No** se descuenta del efectivo a entregar ni del neto operador.

## 4. Comisión mensual en Reportes Dashboard
`src/components/dashboard/ReportsPanel.tsx`: nueva sección **"Comisión STOCKIA"** con:
- KPI mes actual: `ventas_brutas_mes × 2.5%`
- Tabla histórica 12 meses: mes | ventas brutas | comisión
- Fuente: `sale_items` + `ticket_sales` agrupados por mes (filtrados por venue, excluye cancelados).

## 5. Memoria
Nueva: `mem://features/billing/stockia-commission` — tasa 2.5%, dónde aparece, naturaleza informativa (para facturación semanal), excluye cortesías, no afecta cash.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/commission.ts` (nuevo) | Constante + helper |
| `src/lib/printing/qz.ts` | Footer STOCKIA |
| `src/lib/printing/ticket-print.ts` | Footer STOCKIA en 3 piezas |
| `src/lib/reporting/jornada-cashier-report.ts` | Línea comisión informativa |
| `src/components/dashboard/ReportsPanel.tsx` | Sección comisión mensual + histórico |
| Memoria | Documentar |
