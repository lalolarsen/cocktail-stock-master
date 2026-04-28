## Mejora del Panel de Reportes

Rediseño integral del panel `/reportes` enfocado en 3 ejes: **performance**, **UX/visual** y **calidad de exportaciones**, manteniendo intactos los reportes existentes (POS térmico, Conteo, EERR, CSV).

---

### 1. Performance (carga ~3-5x más rápida)

**Problemas actuales:**
- Trae **todas las profiles del venue** sin filtro (puede ser cientos de filas).
- Hace 4 fetches grandes en paralelo y **calcula los KPIs en el cliente** sobre cada venta del mes.
- Re-fetch completo al cambiar de mes, sin caché.

**Solución:**
- **Crear RPC `get_monthly_jornadas_summary(venue_id, year, month)`** que devuelva en una sola consulta agregada por jornada: total ventas, conteos, alcohol/tickets, efectivo/tarjeta, cancelaciones, top 3 vendedores (con nombre vía JOIN). El cliente recibe los reportes ya calculados.
- Reemplazar el fetch de todas las `profiles` por solo los IDs necesarios (vendedores que aparecen).
- Cargar `jornada_financial_summary` en el mismo RPC (LEFT JOIN).
- Usar `useMemo` para totales mensuales (hoy se recalculan en cada render).
- Mantener el fetch de detalle de ventas individual (lazy on expand) — ya está bien.

**Resultado esperado:** 1 query RPC en vez de 4 queries + procesamiento JS pesado. Para meses con 30 jornadas y miles de ventas, debería pasar de ~3-5s a <1s.

---

### 2. Rediseño visual / UX

**Layout nuevo:**

```text
┌────────────────────────────────────────────────────┐
│ Reportes                              [Mes ▼] [↻] │
│ Auditoría y descargas por jornada                  │
├────────────────────────────────────────────────────┤
│ ▸ Resumen del mes (4 KPI cards compactos)          │
│   Ventas | Margen | Cancelaciones | Comisión       │
├────────────────────────────────────────────────────┤
│ ▸ Comparativa (mini sparkline ventas vs mes ant.)  │
├────────────────────────────────────────────────────┤
│ ▸ Jornadas (lista colapsable, una por fila)        │
│   #N · Nombre · fecha   $XXX | margen | [acciones] │
└────────────────────────────────────────────────────┘
```

- **Header sticky** con selector de mes y botón refresh.
- **Tarjetas de KPI** unificadas con el estilo de `FinancePanel` (más limpio, sin íconos saturados).
- **Comisión STOCKIA** integrada como un 4º KPI en la grilla principal (no como card separada que ocupa demasiado).
- **Mini comparativa mensual**: badge con flecha ↑/↓ vs mes anterior en cada KPI clave.
- **Fila de jornada compactada**: estado, número/nombre, fecha y total en una línea; botones de descarga agrupados en un dropdown "Descargar ▼" (POS · Conteo · QRs · CSV · EERR) para no saturar la fila.
- **Detalle expandido** mejorado: KPI grid + tabla densa + filtros rápidos (Todas / Solo POS X / Solo canceladas).
- Optimización mobile (iPhone): tarjetas stacked, dropdown de descargas en lugar de botones lado-a-lado.

---

### 3. Mejorar exportaciones

**CSV de ventas detallado:**
- Agregar columnas: `Hora apertura jornada`, `Hora cierre`, `Subtotal`, `Descuento`, `Productos vendidos` (concatenado).
- Incluir BOM UTF-8 (ya está) y separador correcto para Excel ES.
- Botón "CSV completo del mes" además del CSV por jornada.

**Nuevo: Excel consolidado del mes** (descarga única con tabs):
- Tab 1: Resumen mensual (KPIs).
- Tab 2: Jornadas (una fila por jornada con todos los totales).
- Tab 3: Ventas detalladas (todas las del mes).
- Tab 4: Comisión STOCKIA.
- Generado con `xlsx` (SheetJS, ya disponible en proyecto si no, agregarla).

**Reportes existentes (POS, Conteo, EERR):** se mantienen sin cambios funcionales — solo se reubican en el dropdown de cada jornada.

---

### Detalle técnico

**Archivos a modificar:**
- `src/components/dashboard/ReportsPanel.tsx` — refactor completo (split en sub-componentes).
- Nuevo: `src/components/dashboard/reports/MonthSummaryCards.tsx`
- Nuevo: `src/components/dashboard/reports/JornadaReportRow.tsx` (extraído del actual)
- Nuevo: `src/components/dashboard/reports/DownloadMenu.tsx` (dropdown unificado)
- Nuevo: `src/lib/reporting/monthly-excel-export.ts` (export consolidado)
- Nueva migración SQL: RPC `get_monthly_jornadas_summary` (SECURITY DEFINER, filtrada por `venue_id` del usuario).

**Dependencias:**
- Verificar si `xlsx` (SheetJS) está instalada; si no, agregarla.

**No se toca:**
- `pos-sales-report.ts`, `product-sales-pdf.ts`, `RedeemReportButton.tsx`, `JornadaCloseSummaryDialog.tsx`, `jornada-reporting.ts` — quedan idénticos.
- Lógica de comisión STOCKIA (`commission.ts`) — se mantiene la fórmula informativa 2.5%.
- Multi-tenant: el RPC respetará aislamiento por `venue_id` automático.