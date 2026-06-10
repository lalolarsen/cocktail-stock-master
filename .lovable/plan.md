
# Métricas del Lector de Facturas

Reenfocar el dashboard de **Compras → Lector de facturas** para que las 3 métricas que pediste sean el foco principal, manteniendo además las pestañas existentes de "Venta vs Compra" y "Top insumos".

## Métricas principales (las 3 pedidas)

1. **Precio neto del insumo vs compras anteriores**
   - Refactor de `PriceHistoryView`.
   - Selector de insumo (de los comprados en el rango).
   - Tabla histórica: fecha · proveedor · documento · unidades · **costo unitario neto** · **Δ vs compra anterior** (% y CLP, verde/rojo).
   - Mini-gráfico de evolución del costo unitario neto (ya existe).

2. **Valor total de cada compra** (nueva pestaña `Facturas`)
   - Lista de facturas confirmadas en el rango: fecha · proveedor · N° doc · neto · IVA · **total** · N° líneas.
   - KPIs arriba: total comprado, # de facturas, ticket promedio.
   - Click en una fila → navega al detalle (`/admin/proveedores/import/:id`).

3. **Comparación semanal compra vs venta** (refactor de `WeeklyView`)
   - Gráfico de barras dual por semana ISO: Comprado (neto) vs Vendido (neto sin IVA).
   - Tabla: semana · comprado · vendido · **ratio compra/venta %** · diferencia.

## Pestañas que se mantienen

- **Venta vs Compra (por insumo)** — `SalesVsPurchaseView` sin cambios.
- **Top insumos** — `TopInsumosView` sin cambios.

## Orden final de tabs en `InvoiceAnalytics`

1. Facturas (nuevo)
2. Precio por insumo
3. Semanal compra/venta
4. Venta vs Compra
5. Top insumos

## Cambios en código

### `src/components/dashboard/compras/InvoiceAnalytics.tsx`
- Agregar carga de `purchase_imports` con `net_subtotal, vat_amount, total_amount, document_number` para el tab Facturas.
- Agregar agregado semanal de `sales` (neto = `total_amount / 1.19`) por semana ISO en `America/Santiago` para el tab Semanal.
- Nuevo componente `InvoicesListView` (tab Facturas) con KPIs + tabla clickeable.
- Refactor `WeeklyView` → agrega columna Vendido, Ratio %, Diferencia y gráfico barras dual con Recharts.
- Refactor `PriceHistoryView` → agrega columna Δ vs compra anterior y proveedor en la tabla bajo el gráfico.

### `src/components/dashboard/ComprasPanel.tsx`
- Quitar la pestaña **"Resumen mensual"** (`PurchaseMetrics`): el nuevo tab "Facturas" + "Semanal compra/venta" cubren esa información sin duplicar.
- Dejar: `Análisis` (las 5 sub-pestañas) y `Facturas` (gestión/upload existente de `ProveedoresPanel`).

### Archivos a borrar
- `src/components/dashboard/compras/PurchaseMetrics.tsx`
- `src/hooks/useComprasMetrics.ts`

## Notas técnicas
- Venta "neta" para ratio: `sales.total_amount / 1.19` (IVA 19% Chile). Documentar el supuesto bajo el ratio.
- `isoWeek()` y `fetchAllRows` ya existen, se reutilizan.
- Sin cambios de schema ni de backend.
