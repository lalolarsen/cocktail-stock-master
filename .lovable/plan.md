

# Plan: Redeem sin bloqueo por stock + auditoría + conciliación

## 1. Diagnóstico del estado actual

### RPCs de redeem (3 overloads activos)

**`redeem_pickup_token(p_token, p_bartender_bar_id, p_mixer_overrides, p_delivered_by_worker_id)`** — 315 líneas. Función principal usada por `/bar` y `HybridQRScannerPanel`. Flujo:
1. Rate-limit 2s por bartender
2. Busca token por `token` exacto o `short_code`
3. Valida estados (redeemed → `ALREADY_REDEEMED`, cancelled, expired, invalid)
4. **COVER tokens** (líneas 464-494): consulta `stock_balances` por ingrediente, si falta → `INSUFFICIENT_BAR_STOCK`. Si hay stock → `UPDATE stock_balances`, `INSERT stock_movements`
5. **SALE tokens** (líneas 532-574): mismo patrón — consulta stock, bloquea si insuficiente, descuenta si hay
6. Marca `redeemed`, inserta en `pickup_redemptions_log` con metadata (deliver, consumed, bar_name)

**`auto_redeem_sale_token(p_sale_id, p_bar_location_id, p_seller_id [, p_mixer_overrides])`** — 2 overloads (3 y 4 params). Usado por `HybridPostSaleWizard` post-venta. Flujo:
1. Pre-flight check de stock → retorna `stock_insufficient` si falta
2. Consume via `consume_stock_fefo` → descuenta lotes FEFO
3. Marca token `redeemed`, inserta log

**`redeem_pickup_token(p_token)` (1 param)** — Legacy simple: busca con `ILIKE '%' || token || '%'` en status `pending`, marca `redeemed`. Sin log, sin trazabilidad.

### Puntos exactos de bloqueo por stock

| Función | Líneas | Qué hace |
|---|---|---|
| `redeem_pickup_token` 4-param | 473-494 | Cover: `stock_balances` check → `INSUFFICIENT_BAR_STOCK` |
| `redeem_pickup_token` 4-param | 538-574 | Sale: `stock_balances` check → `INSUFFICIENT_BAR_STOCK` |
| `auto_redeem_sale_token` 3-param | 50-90 | Pre-flight `stock_balances` → `stock_insufficient` |
| `auto_redeem_sale_token` 4-param | 207-248 | Pre-flight `stock_balances` → `stock_insufficient` |

### Bypass frontend actual

- **`Bar.tsx`** (369-398): Si RPC retorna error o lanza excepción → fuerza `success: true` con `_forced: true` y `deliver: "Pedido (sin confirmar)"`. Pierde trazabilidad backend.
- **`HybridQRScannerPanel.tsx`** (158-195): Mismo bypass forzado.
- **`HybridPostSaleWizard.tsx`** (98-101): NO tiene bypass — muestra error "stock insuficiente" al vendedor.

### Tablas participantes

| Tabla | Rol |
|---|---|
| `pickup_tokens` | Token con estado (`issued`/`redeemed`/`expired`/`cancelled`) |
| `pickup_redemptions_log` | Log con `pickup_token_id`, `bartender_id`, `result`, `metadata` JSONB, `venue_id`, `jornada_id`, `delivered_by_worker_id` |
| `stock_balances` | Balance por producto/ubicación — **consultado y modificado** durante redeem |
| `stock_movements` | Movimientos de stock — **insertado** durante redeem |
| `stock_lots` | Lotes FEFO — consumidos por `consume_stock_fefo` en auto_redeem |
| `sale_items` / `cocktail_ingredients` | Items y recetas para calcular consumo |

### Log existente

`pickup_redemptions_log` ya guarda: `pickup_token_id`, `sale_id`, `bartender_id`, `pos_id` (text), `result` (enum: success/not_found/already_redeemed/cancelled/expired/insufficient_stock/not_paid), `metadata` JSONB (deliver, consumed, bar_name, inventory_frozen), `venue_id`, `jornada_id`, `delivered_by_worker_id`. **Falta**: `bar_location_id` como UUID dedicado, `theoretical_consumption` JSONB, `items_snapshot` JSONB.

### Reportes existentes

`jornada_financial_summary` ya tiene `tokens_issued_count`, `tokens_redeemed_count`, `tokens_pending_count`, `tokens_expired_count`, `tokens_cancelled_count`. `ReportsPanel` muestra datos por jornada. No existe reporte detallado de redeems ni descarga CSV dedicada.

---

## 2. Cambios propuestos

### Estrategia: Opción A — Redeem no toca stock real

El redeem pasa a ser pura confirmación operativa + registro de consumo teórico. El stock real se ajusta solo por conteo Excel / reconciliación.

### Etapa 1: Migración DB (Riesgo: MUY BAJO)

Agregar 3 columnas a `pickup_redemptions_log`:

```sql
ALTER TABLE pickup_redemptions_log
  ADD COLUMN IF NOT EXISTS theoretical_consumption JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS items_snapshot JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bar_location_id UUID REFERENCES stock_locations(id) DEFAULT NULL;
```

**Rollback**: `ALTER TABLE ... DROP COLUMN`.

### Etapa 2: Reescribir RPCs (Riesgo: BAJO)

**`redeem_pickup_token` (4 params)** — Cambios puntuales:
- **Eliminar** los bloques de consulta a `stock_balances` (covers: líneas 473-488 y check 491-494; sales: líneas 538-558 y check 571-574)
- **Eliminar** los bloques de `UPDATE stock_balances` + `INSERT stock_movements` (covers: 497-516; sales: 577-631)
- **Agregar**: cálculo de consumo teórico — recorrer `cocktail_ingredients` y acumular en `v_theoretical_consumption` JSONB **sin tocar stock**
- **Agregar**: `items_snapshot` con nombre/cantidad de cada item + ingredientes con cantidades
- **Guardar** ambos en las nuevas columnas de `pickup_redemptions_log` + `bar_location_id`
- **Mantener intacto**: rate-limit, validaciones de estado, logging de errores, match por token/short_code, UPDATE pickup_tokens

**`auto_redeem_sale_token` (ambos overloads)** — Cambios:
- **Eliminar** pre-flight stock check (no retornar `stock_insufficient`)
- **Eliminar** `consume_stock_fefo` calls
- **Agregar** cálculo teórico y snapshot
- Siempre retornar éxito si token válido
- Mantener: resolución de venue, jornada, items_array

**`redeem_pickup_token` (1 param)** — Eliminar (DROP FUNCTION). Es legacy, no se usa, y su `ILIKE '%..%'` es peligroso.

**Rollback**: restaurar funciones anteriores via migración reversa.

### Etapa 3: Limpiar frontend (Riesgo: BAJO)

**`Bar.tsx`**:
- Eliminar bypass forzado (369-398) — el RPC nuevo nunca falla por stock
- Simplificar `resolveDeliveredByAndRedeem`: eliminar `bottleChecks` param y lógica de `openBottlesHook.deductMl` en el flujo de redeem (líneas 412-420)
- Quitar `INSUFFICIENT_BAR_STOCK` de `getErrorTitle`

**`HybridQRScannerPanel.tsx`**:
- Eliminar bypass forzado (158-195)

**`HybridPostSaleWizard.tsx`**:
- Eliminar manejo de `stock_insufficient` (98-101) y pantalla de `missingItems` (130-175)
- El RPC ahora siempre retorna éxito → ir directo a "ENTREGAR"
- Quitar texto "Descontando stock de..." del paso processing

### Etapa 4: Reporte de redeems en jornada (Riesgo: BAJO)

Agregar sección en `ReportsPanel`:
- Query a `pickup_redemptions_log` por `jornada_id` con las nuevas columnas
- Contadores: emitidos (de `pickup_tokens`), redimidos (result=success), pendientes, duplicados (already_redeemed), errores (insufficient_stock/not_found)
- Desglose por producto desde `items_snapshot`
- Consumo teórico por insumo desde `theoretical_consumption`
- Botón descarga CSV usando patrón existente de generación de reportes

### Etapa 5: Conciliación Excel (Riesgo: BAJO)

Agregar vista de comparación en panel existente (`StockReconciliation` o `ReportsPanel`):
- Por jornada + ubicación: sumar `theoretical_consumption` de todos los redeems
- Comparar con stock initial (snapshot inicio jornada) + reposiciones - consumo teórico vs. conteo Excel informado
- Mostrar tabla: producto | esperado | informado | diferencia | estado (calza/sobrante/faltante)

---

## 3. Archivos a modificar

| Archivo | Cambio | Etapa |
|---|---|---|
| Migración SQL | ALTER TABLE pickup_redemptions_log + 3 columnas | 1 |
| Migración SQL | CREATE OR REPLACE `redeem_pickup_token` 4-param sin stock | 2 |
| Migración SQL | CREATE OR REPLACE `auto_redeem_sale_token` 3 y 4-param sin stock | 2 |
| Migración SQL | DROP FUNCTION `redeem_pickup_token(text)` | 2 |
| `src/pages/Bar.tsx` | Eliminar bypass + bottle deduction en redeem | 3 |
| `src/components/sales/HybridQRScannerPanel.tsx` | Eliminar bypass | 3 |
| `src/components/sales/HybridPostSaleWizard.tsx` | Eliminar stock_insufficient handling | 3 |
| `src/components/dashboard/ReportsPanel.tsx` | Sección redeems + descarga CSV | 4 |

---

## 4. Seguridad

- `pickup_redemptions_log` ya tiene RLS: INSERT con `WITH CHECK (true)` (sistema puede insertar), SELECT con `USING (venue_id = get_user_venue_id())`. Las nuevas columnas heredan estas políticas automáticamente.
- Los logs son inmutables (no hay política UPDATE/DELETE).
- El consumo teórico como JSONB snapshot es inmutable — cambios futuros en recetas no afectan reportes históricos.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| RPC falla durante deploy | Migraciones transaccionales; rollback automático |
| Frontend espera campos que cambian | Los RPCs mantienen misma estructura de retorno (success, deliver, bar_name) |
| Stock deja de descontarse automáticamente | Consumo teórico queda registrado para conciliación posterior; la operación actual ya depende de conteo Excel |
| Receta cambia post-redeem | Snapshot JSONB inmutable por redeem |
| Overload de 1 param eliminado | Verificar que ningún código lo llama (solo el frontend usa 4-param) |

---

## 6. Orden de implementación

**Bloque 1** (Etapas 1-3, implementar juntas): DB + RPCs + frontend cleanup. Son interdependientes y de bajo riesgo. Resultado: redeem funciona sin bloqueo, con trazabilidad completa.

**Bloque 2** (Etapa 4): Reporte de redeems. Independiente del Bloque 1 pero requiere las nuevas columnas.

**Bloque 3** (Etapa 5): Conciliación Excel. Puede implementarse después según prioridad operativa.

