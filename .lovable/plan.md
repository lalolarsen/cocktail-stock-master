

# Plan: Excel-First Inventory Flow

## Resumen

Reemplazar el `ExcelUpload` actual (simple, por nombre, sin ubicaciones) con un módulo completo que procesa la plantilla unificada con 3 tipos de movimiento: COMPRA, TRANSFERENCIA y CONTEO. Usa `products.code` como `sku_base` para el matching.

## Fase 1 — Parser y tipos (nuevo archivo)

### `src/lib/excel-inventory-parser.ts`

Nuevo módulo de parsing que:
- Lee la hoja "Plantilla_Unica" del XLSX subido
- Mapea las 21 columnas de la plantilla a un tipo `ExcelInventoryRow`
- Valida por tipo_movimiento:
  - COMPRA: requiere ubicacion_destino, sku_base, cantidad_envases, costo_neto_envase
  - TRANSFERENCIA: requiere ubicacion_origen, ubicacion_destino, sku_base, cantidad_base_movida
  - CONTEO: requiere ubicacion_destino, sku_base, stock_real_contado
- Para COMPRA ML: calcula `cantidad_base_calculada = formato_compra_ml × cantidad_envases`
- Para COMPRA UNIT: `cantidad_base_calculada = cantidad_envases`
- Retorna `{ rows: ParsedRow[], errors: ValidationError[] }` donde cada row tiene su estado de validación

### Resolución de SKU

- Cargar todos los `products` del venue con sus `code`, `capacity_ml`, `cost_per_unit`
- Cargar todos los `stock_locations` del venue
- Resolver `sku_base` → `product_id` por `products.code` (case-insensitive)
- Resolver `ubicacion_origen/destino` → `location_id` por `stock_locations.name`
- Marcar errores en filas donde no se encuentre match

## Fase 2 — Preview con validación (refactor componente)

### `src/components/dashboard/ExcelUpload.tsx` — Reescritura completa

Nuevo flujo:
1. **Descargar plantilla** — genera XLSX con las 21 columnas + hoja de referencia + hoja Export_Stock_Actual
2. **Descargar stock actual** — exporta stock teórico por ubicación desde `stock_balances` + `products` + `stock_locations`
3. **Subir archivo** — parsea con el nuevo parser
4. **Preview** — tabla agrupada por tipo_movimiento con validación visual:
   - Verde: fila válida
   - Rojo: error (SKU no encontrado, ubicación inválida, stock insuficiente para transferencia)
   - Resumen: X compras, Y transferencias, Z conteos, N errores
5. **Confirmar** — procesa secuencialmente por tipo (primero compras, luego transferencias, luego conteos)

### `src/components/dashboard/StockImportPreviewDialog.tsx` — Reemplazar

Reemplazar el dialog actual por uno nuevo que muestre la tabla con las 21 columnas relevantes por tipo, badges de estado, y botón de confirmar solo si no hay errores críticos.

## Fase 3 — Procesamiento transaccional

### Lógica de confirmación en `ExcelUpload.tsx`

**COMPRA:**
1. Crear `stock_intake_batches` (notes = documento_ref + proveedor)
2. Por cada línea: insertar `stock_intake_items` con `net_unit_cost`, `quantity` (en bottles o units), `location_id` = Bodega Principal
3. Upsert `stock_balances` (incrementar quantity)
4. Insertar `stock_movements` con `movement_type = 'compra'`
5. Recalcular CPP: usar `calculateCPP()` de `product-type.ts` y actualizar `products.cost_per_unit`
6. Sincronizar `products.current_stock` = SUM de todos los balances

**TRANSFERENCIA:**
1. Crear `stock_transfers` (from_location_id, to_location_id)
2. Por cada línea: insertar `stock_transfer_items`
3. Decrementar `stock_balances` en origen, incrementar en destino
4. Insertar 2 `stock_movements`: `transfer_out` y `transfer_in`
5. Validar que balance origen no quede negativo ANTES de aplicar
6. Sincronizar `products.current_stock`

**CONTEO:**
1. Leer `stock_balances` actual para la ubicación
2. Calcular diferencia = stock_real_contado - teórico
3. Si diferencia < 0: insertar `stock_movements` con `movement_type = 'waste'` (merma)
4. Si diferencia > 0: insertar `stock_movements` con `movement_type = 'reconciliation'` (ajuste positivo)
5. Actualizar `stock_balances` al valor real contado
6. Sincronizar `products.current_stock`

## Fase 4 — Exportación de stock actual

### Botón "Descargar Stock Actual"

Query:
```sql
SELECT sl.name, p.code, p.name, p.capacity_ml, p.unit, p.cost_per_unit,
       sb.quantity, sb.updated_at
FROM stock_balances sb
JOIN products p ON sb.product_id = p.id
JOIN stock_locations sl ON sb.location_id = sl.id
WHERE sb.venue_id = ?
ORDER BY sl.name, p.name
```

Generar XLSX con columnas: fecha_exportacion, ubicacion, sku_base, producto_nombre, tipo_consumo (ML/UNIT basado en capacity_ml), stock_actual_base, unidad_base, cpp_actual_base, valor_total_stock, ultima_actualizacion.

## Archivos a modificar/crear

| Archivo | Acción |
|---|---|
| `src/lib/excel-inventory-parser.ts` | **Crear** — parser + validación |
| `src/components/dashboard/ExcelUpload.tsx` | **Reescribir** — nuevo flujo completo |
| `src/components/dashboard/StockImportPreviewDialog.tsx` | **Reescribir** — preview por tipo_movimiento |
| `src/pages/Index.tsx` | Sin cambios (ya importa ExcelUpload) |

## Lo que NO se toca

- Tablas DB (ya existen todas las necesarias)
- Lógica de redeem/pickup (ya descuenta desde stock_balances)
- Recetas
- `product-type.ts` (se reutiliza `isBottle`, `calculateCPP`)
- Autenticación, multi-venue, jornadas

## Convenciones

- `sku_base` = `products.code` (ya existe, único por venue)
- `tipo_consumo` ML/UNIT se determina por `isBottle(product)` — no se guarda nuevo campo
- CPP se redondea a enteros (CLP)
- Stock negativo bloqueado en transferencias (validación pre-confirm)

