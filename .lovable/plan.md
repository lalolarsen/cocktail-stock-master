# Análisis: ¿Qué le falta al sistema en vivo para soportar >1000 ventas/día?

## Lo que ya está bien
- **Fase 1 (panel en vivo)**: snapshot RPC consolidado + Realtime sobre `stock_balances` y `stock_movements` con debounce 600ms.
- **Fase 2 (lector facturas)**: pipeline `extract-invoice` con IA, revisión humana en `/admin/proveedores/import/:id`, cierra ciclo a CPP/Bodega.
- **Fase 3 (conteo cierre)**: RPC `apply_shift_count` con umbral 10%, alertas automáticas.
- **DiStock**: stock se descuenta solo en redención QR (no en venta), lo que ya alivia presión de escritura en POS.

## Riesgos detectados para alta concurrencia (>1000 ventas/día ≈ 1 evento/30s sostenido, picos 5-10/s)

### 1. Realtime + REPLICA IDENTITY FULL en `stock_movements` (CRÍTICO)
`REPLICA IDENTITY FULL` envía la fila completa por cada INSERT/UPDATE. En `stock_movements` (tabla append-only de altísimo volumen) esto satura el bus de Realtime y multiplica el ancho de banda. Cada redención dispara un broadcast a todos los gerentes conectados. Con 1000+ ventas el bus se degrada.

**Fix**: revertir `stock_movements` a `REPLICA IDENTITY DEFAULT` (PK basta). Mantener FULL solo en `stock_balances` (que es la tabla pequeña que importa para diff).

### 2. RPC `get_realtime_inventory_snapshot` ineficiente bajo carga
- El CTE `last_mov` agrupa **toda la historia** de `stock_movements` por venue cada vez que se llama. En 6 meses puede ser >100k filas.
- Sin índice cubriente para `(venue_id, product_id, to/from_location_id, created_at)`.
- Se ejecuta cada 600ms si llegan eventos seguidos → cada gerente abierto = N queries pesadas/min.

**Fix**:
- Reescribir `last_mov` con `DISTINCT ON` y filtro temporal (últimos 30 días).
- Agregar índice `(venue_id, product_id, COALESCE(to_location_id, from_location_id), created_at DESC)`.
- Subir debounce del hook a **1500ms** y agregar throttle máximo (1 fetch/2s).

### 3. Suscripción Realtime por venue sin filtro de columnas
El canal recibe el payload completo de cada movimiento. Como solo necesitamos saber "algo cambió", basta con el evento.

**Fix**: cambiar la suscripción de `stock_movements` a solo `INSERT` con payload mínimo (ya está limitado a INSERT, pero combinado con fix #1 reduce 90% del tráfico).

### 4. `apply_shift_count` no es transaccional ante concurrencia
Si dos bartenders cierran al mismo tiempo en la misma ubicación (raro pero posible) o si la misma ubicación recibe ventas mientras se aplica el conteo, el `delta` calculado puede quedar desfasado. No hay `FOR UPDATE` lock.

**Fix**: tomar `SELECT ... FOR UPDATE` sobre el row de `stock_balances` antes de calcular delta.

### 5. Falta histórico/log de conteos por turno
Hoy el conteo solo deja `stock_movements` tipo `ajuste`, pero no hay tabla `shift_counts` ni `shift_count_lines` para auditoría posterior por jornada/bartender.

**Fix**: crear `shift_counts` (id, jornada_id, location_id, user_id, total_variance_pct, status) y `shift_count_lines` (count_id, product_id, theoretical, real, delta, alerted) escritas por la RPC. Sin esto, gerencia no puede revisar qué bartender tuvo qué diferencias históricas.

### 6. Panel en vivo sin paginación ni virtualización
El snapshot retorna **todos** los productos × ubicaciones del venue. En venues grandes (300 productos × 4 barras = 1200 filas) la tabla DOM es pesada. El cliente puede congelarse al re-render por cada evento Realtime.

**Fix**: virtualización con `@tanstack/react-virtual` en la tabla, o agrupar por producto y expandir ubicaciones on-demand.

### 7. Capital inmovilizado calculado en cliente
Los KPIs (totalValue, lowCount, criticalCount) se recalculan en JS. Con miles de filas el `useMemo` igual corre por re-render. Mejor incluir **agregados precomputados** en la RPC (1 fila aparte con totales).

### 8. Sin alertas push proactivas
Hoy las alertas se ven al refrescar `AlertsPanel`. Con >1000 ventas, gerencia necesita un **toast en vivo** cuando algo entra a estado `critical` o `low` (suscripción a `stock_alerts`).

**Fix**: hook `useStockAlertsLive` que hace toast al insertar nueva alerta del venue.

### 9. Lector de facturas sin cola de retry
`extract-invoice` es síncrono. Si la IA falla (429/402) la factura queda en `UPLOADED` sin reintento automático. En operación real con muchas facturas semanales, debe haber reintento con backoff o un panel de "fallidas".

**Fix**: `DocumentsRetryPanel` ya existe — verificar que cubra `purchase_imports` con status fallido y agregar botón "Reintentar todas".

### 10. Conteo de cierre sin filtro pre-cargado por bartender
El `ShiftCountDialog` lista todos los productos. Un bartender cierra solo su barra, pero ve el catálogo completo. Riesgo de error humano.

**Fix**: precargar solo productos con `stock_balances.quantity > 0` en esa ubicación + buscador por categoría/marca.

---

## Plan de implementación (orden por impacto)

### Migración SQL única
1. `ALTER TABLE stock_movements REPLICA IDENTITY DEFAULT` (revertir).
2. Crear índice `idx_stock_movements_venue_product_loc_created` para acelerar `last_mov`.
3. Reescribir `get_realtime_inventory_snapshot` con `DISTINCT ON` + ventana 30 días + fila TOTALS al final.
4. `apply_shift_count`: añadir `SELECT ... FOR UPDATE` y registrar en nuevas tablas.
5. Crear `shift_counts` y `shift_count_lines` con RLS por venue.

### Frontend
6. `useRealtimeInventory`: subir debounce a 1500ms + throttle 2s + extraer KPIs desde fila TOTALS.
7. Virtualizar tabla del `RealtimeInventoryDashboard` (instalar `@tanstack/react-virtual`).
8. Nuevo hook `useStockAlertsLive` con toast en gerencia/admin.
9. `ShiftCountDialog`: filtrar productos con stock>0 en la ubicación + buscador por categoría.
10. `DocumentsRetryPanel`: incluir `purchase_imports` con status fallido.

---

## Detalles técnicos
- Las nuevas tablas `shift_counts/shift_count_lines` quedan inmutables (insert-only desde RPC) y con RLS `venue_id = get_user_venue_id()`.
- El throttle del hook usa un `lastFetchAt` ref para garantizar máximo 1 fetch cada 2 segundos aunque lleguen 50 eventos.
- Virtualización solo en la `<TableBody>` con altura fija 48px por fila.
- La suscripción a `stock_alerts` filtra por `venue_id` y muestra `toast.warning` con el mensaje.
- El payload del snapshot agrega una fila final con `product_id = NULL` que contiene los totales agregados (totalValue, productCount, lowCount, criticalCount).
