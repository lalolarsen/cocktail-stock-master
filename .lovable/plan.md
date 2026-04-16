
## Problema

3 issues en el parseo de plantilla de Conteo:

1. **Preview sin scroll ni edición** — el dialog usa `BulkStockIntakeGrid` pero el flujo de Excel CONTEO va por otro componente que renderiza tabla simple sin scroll ni inputs editables.
2. **No reconoce fracciones volumétricas** — para botellas (capacity_ml > 0), si Excel reporta `2500ml` de un producto de `1000ml`, el sistema debe interpretarlo como `2.5 botellas` (o guardar `2500ml` como stock_real en ml). Hoy parece tomar el número literal sin convertir.
3. **Comparación teórico vs real incorrecta** — al no convertir unidades, `stock_teorico` (en unidades base) vs `stock_real` (en lo que venga del Excel) compara peras con manzanas.

## Exploración necesaria (antes de implementar)

Leer:
- `src/components/dashboard/InventoryHub.tsx` — flujo de carga Excel CONTEO
- Componente que renderiza el preview de CONTEO actualmente (probablemente `EditableBatchPreview` ya existe pero no se usa, o se usa una versión read-only)
- `src/lib/excel-inventory-parser.ts` — lógica de parseo y cálculo de `computed_base_qty` / `stock_real`
- Edge function o RPC que valida/inserta el batch de CONTEO

## Solución propuesta

### A. Parser — interpretar ml correctamente para botellas
En `excel-inventory-parser.ts` (rama CONTEO):
- Si `isBottle(product)`:
  - Si Excel trae columna `ml` o el valor es claramente volumétrico → guardar `stock_real` en **ml** (unidad base de botellas).
  - Si Excel trae unidades fraccionarias (ej. `2.5`) → convertir a ml: `stock_real_ml = qty * capacity_ml`.
  - Aceptar decimales (parseFloat, no parseInt).
- Si `isUnit(product)`: dejar como entero/decimal de unidades.
- `stock_teorico` debe traerse en la **misma unidad** (ml para botellas, unidades para discretos) consultando `stock_balances`.

### B. Preview editable con scroll
Reemplazar el componente actual del preview de CONTEO por `EditableBatchPreview` (ya existe y soporta CONTEO con columnas Teórico/Real editables). Envolver en contenedor con `max-h-[60vh] overflow-auto` para scroll vertical real.

Asegurar que la columna "Real" para botellas:
- Muestra/edita en **ml** con label dinámico (`ml` para botellas, `ud` para unitarios).
- Mostrar también equivalente en botellas (ej. `2500 ml ≈ 2.5 bot`) como hint debajo del input.

### C. Validación y diferencia
En el resumen del CONTEO:
- Diferencia = `stock_real - stock_teorico` en unidad base.
- Mostrar en columna extra "Diferencia" coloreada (verde/rojo).
- Permitir que el usuario edite `stock_real` y la diferencia se recalcule en vivo.

### D. Persistencia
Asegurar que el insert al batch usa `stock_real` ya normalizado en unidad base (ml para botellas) y que el ajuste posterior (`adjust_stock` o equivalente) genera el movimiento correcto.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/lib/excel-inventory-parser.ts` | Parseo decimal + conversión ml para botellas en CONTEO |
| `src/components/dashboard/InventoryHub.tsx` (o donde se renderice el preview de CONTEO) | Usar `EditableBatchPreview` en lugar del read-only actual; envolver en scroll |
| `src/components/dashboard/EditableBatchPreview.tsx` | Para CONTEO: label dinámico ml/ud, hint de equivalente en botellas, columna Diferencia |
| Edge function de validación CONTEO (si existe) | Aceptar decimales en stock_real |

## Memoria a actualizar

`mem://features/inventory/movement-logic-compra-transferencia-conteo` — añadir regla: CONTEO de botellas se ingresa/almacena en **ml** (unidad base); decimales permitidos; conversión automática desde botellas fraccionarias si el Excel lo trae así.
