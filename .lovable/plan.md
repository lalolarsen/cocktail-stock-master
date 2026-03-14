

## Plan: Consolidar Mixers en 2 Productos Genéricos

### Resumen
Crear 2 productos genéricos ("Mixer Tradicional" a $400 y "Red Bull" a $740), consolidar todo el stock por ubicación en ellos, desactivar los individuales, y hacer que el diálogo de mixer se salte automáticamente cuando solo hay 1 opción.

### Paso 1 — Datos (SQL via insert tool, 3 operaciones)

**1a. Crear 2 productos genéricos** en la tabla `products`:
- "Mixer Tradicional": category=`mixers_tradicionales`, cost_per_unit=400, unit=`unidad`, venue_id del venue actual, `is_active_in_sales=true`
- "Red Bull": category=`redbull`, cost_per_unit=740, unit=`unidad`, venue_id del venue actual, `is_active_in_sales=true`

**1b. Consolidar stock_balances**: Para cada una de las 6 ubicaciones, sumar todas las cantidades de productos `mixers_tradicionales` y crear un solo registro para el nuevo producto genérico. Igual para `redbull`. Luego eliminar los balances de los productos individuales antiguos.

**1c. Desactivar productos individuales**: UPDATE todos los 17 tradicionales + 10 redbull con `is_active_in_sales = false` (ya lo están, pero se confirma).

### Paso 2 — Código: Filtrar solo productos activos en `useMixerCatalog`

Agregar `.eq("is_active_in_sales", true)` al query de productos en `useMixerCatalog.ts` para que solo muestre los genéricos.

### Paso 3 — Código: Auto-selección en `MixerSelectionDialog`

Cuando solo hay 1 producto disponible en la categoría requerida, auto-confirmar sin mostrar el diálogo (skip). Esto evita un paso innecesario para el bartender.

### Archivos a modificar
- `src/hooks/useMixerCatalog.ts` — agregar filtro `is_active_in_sales = true`
- `src/components/bar/MixerSelectionDialog.tsx` — auto-skip cuando hay 1 sola opción

