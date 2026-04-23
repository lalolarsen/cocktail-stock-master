

# Integrar Tickets en TODOS los reportes y lecturas

## Diagnóstico

En la base de datos hay **285 tickets vendidos** (280 con jornada). El problema es que la mayoría de los módulos de lectura y reporte siguen consultando solamente la tabla `sales` (alcohol) e ignoran `ticket_sales`. Solo los módulos de Reportes y Dashboard principal fueron migrados antes.

## Módulos con tickets faltantes (confirmado)

| Módulo | Archivo | Impacto |
|---|---|---|
| Analytics mensual | `AnalyticsPanel.tsx` | KPIs, gráficos y top de pago no incluyen tickets |
| Finanzas MTD / EERR | `useFinanceMTD.ts` | Ventas brutas y netas del mes excluyen tickets |
| Stats live por jornada | `jornada/LiveJornadaStats.tsx` | Ventas por POS no muestran caja tickets |
| Gráfico de ganancia | `ProfitChart.tsx` | Curva mensual sin tickets |
| Stats por método de pago | `PaymentMethodStats.tsx` | Efectivo/tarjeta subcontados |
| Actividad reciente | `ActivityPanel.tsx` | Feed sin transacciones de tickets |
| Ventas en vivo | `overview/LiveSalesChart.tsx` | Curva intra-jornada incompleta |
| Top productos | `overview/TopProductsChart.tsx` | Solo lista alcohol |
| Recientes POS | `sales/RecentSalesPanel.tsx` | Solo muestra ventas de alcohol |
| Conciliación caja | `CashReconciliationDialog.tsx` y caja en `JornadaManagement.tsx` | Efectivo esperado no suma tickets |

## Solución

Reutilizar el helper ya existente `src/lib/jornada-reporting.ts` (`fetchJornadaLiveReport`) y **extenderlo** con dos utilidades nuevas para periodos arbitrarios (no solo por jornada):

1. `fetchSalesPeriodReport(venueId, fromISO, toISO)` — lee `sales` + `ticket_sales` activos pagados, devuelve filas unificadas con `source` (`alcohol|ticket`), monto, método de pago, pos, fecha.
2. `fetchSalesByJornadaForKPIs(jornadaId)` — wrapper ya disponible para POS.

Luego refactor punto-a-punto para usar estas utilidades:

### Cambios por archivo

- **AnalyticsPanel.tsx**: cambiar `salesRes` por `fetchSalesPeriodReport` y consolidar totales/KPIs/gráficos sumando tickets. Top productos seguirá viniendo de `sale_items` + `ticket_sale_items` (extender query items).
- **useFinanceMTD.ts**: en el `Promise.all` agregar query paralela a `ticket_sales` del mes y sumar `total` al `gross_sales_total` y `net_sales_total` (tickets no llevan IVA separado, se tratan como neto = total).
- **jornada/LiveJornadaStats.tsx**: usar `fetchJornadaLiveReport(jornadaId).perPos` para alimentar el desglose por POS.
- **ProfitChart.tsx**: query paralela mensual a `ticket_sales` y sumar al bucket diario.
- **PaymentMethodStats.tsx**: agregar `ticket_sales` al agregado de método de pago.
- **ActivityPanel.tsx**: hacer merge cronológico de `sales` y `ticket_sales` recientes.
- **overview/LiveSalesChart.tsx**: sumar tickets a la serie temporal de la jornada activa.
- **overview/TopProductsChart.tsx**: agregar items de `ticket_sale_items` al ranking.
- **sales/RecentSalesPanel.tsx**: incluir últimas ventas de tickets cuando el POS sea de tickets o cuando el rol así lo amerite.
- **CashReconciliationDialog.tsx** y bloque cash en **JornadaManagement.tsx**: incluir efectivo de `ticket_sales` con `payment_method='cash'` y `payment_status='paid'`.

### Consistencia y reglas

- En todos los casos: `payment_status = 'paid'` para tickets, ignorar nulos como `paid` (consistente con `jornada-reporting.ts`).
- Categoría visible: `"Ticket"` cuando `source='ticket'`, POS = nombre del terminal o "Caja Tickets" como fallback.
- Cumplir CLP integer y `America/Santiago` ya establecidos en memoria.
- Mantener uso de `fetchAllRows` para evitar el límite de 1000.

## Validación

Después del cambio, en jornada 45 (donde sabemos que hay ventas de tickets) deben verse:

- Analytics del mes: KPIs mayores, distribución por POS muestra Caja Tickets.
- Finanzas MTD: ventas brutas/netas suben.
- Live Stats jornada: aparece fila de Caja Tickets.
- Recientes y Actividad: muestran transacciones de tickets.
- Conciliación de caja: efectivo esperado suma tickets pagados en cash.

## Archivos a tocar

- `src/lib/jornada-reporting.ts` (extender)
- `src/components/dashboard/AnalyticsPanel.tsx`
- `src/hooks/useFinanceMTD.ts`
- `src/components/dashboard/jornada/LiveJornadaStats.tsx`
- `src/components/dashboard/ProfitChart.tsx`
- `src/components/dashboard/PaymentMethodStats.tsx`
- `src/components/dashboard/ActivityPanel.tsx`
- `src/components/dashboard/overview/LiveSalesChart.tsx`
- `src/components/dashboard/overview/TopProductsChart.tsx`
- `src/components/sales/RecentSalesPanel.tsx`
- `src/components/dashboard/CashReconciliationDialog.tsx`
- `src/components/dashboard/JornadaManagement.tsx` (bloque cash esperado)

