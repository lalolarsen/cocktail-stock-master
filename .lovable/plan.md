

# Plan: Plantilla simplificada para bartender

## Cambios

### 1. Template solo con productos consumidos en la jornada+ubicación (`InventoryComparisonModule.tsx`)

Antes de generar la plantilla, consultar `pickup_redemptions_log` y `courtesy_redemptions` de la jornada seleccionada para obtener los `product_id` que tuvieron consumo. Filtrar la plantilla solo a esos productos.

### 2. Eliminar columna `stock_teorico` de la plantilla

La plantilla queda con solo 3 columnas útiles para el bartender:
- `producto_nombre`
- `sku_base` (oculto/referencia)
- `stock_real` (lo que llena el bartender)

### 3. Botellas en formato aproximado de botellas, no ml

Para productos bottle (`capacity_ml > 0`):
- La columna `stock_real` espera un valor en **botellas decimales** (ej: 2.5 = 2 botellas completas + media)
- Agregar columna `formato` que diga ej: "botella 750ml" para que el bartender sepa qué cuenta
- Al parsear el Excel de vuelta, convertir: `stock_real_ml = valor_ingresado × capacity_ml`

### 4. Crear nueva función `generateComparisonTemplate` en `excel-inventory-parser.ts`

Nueva función dedicada que:
- Recibe solo los product IDs consumidos
- No incluye stock teórico
- Para botellas: indica formato "bot. 750ml" y espera valor en botellas (ej: 2.5)
- Para unitarios: espera cantidad entera

### 5. Ajustar parsing del Excel subido (`handleFileUpload`)

Al leer `stock_real` de un producto bottle, multiplicar por `capacity_ml` para obtener ml antes de comparar.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/excel-inventory-parser.ts` | Nueva función `generateComparisonTemplate` |
| `src/components/dashboard/InventoryComparisonModule.tsx` | Usar nueva función, filtrar por productos consumidos, convertir botellas↔ml al parsear |

