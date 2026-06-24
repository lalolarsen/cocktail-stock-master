## 1. Eliminar referencias a "Comisión STOCKIA"

La comisión ya no existe. Se elimina toda mención (UI, impresiones, exports y correo).

- **`src/lib/commission.ts`** → eliminar archivo (mantener solo `STOCKIA_PRINT_FOOTER` re-ubicado en `src/lib/branding.ts` ya que se usa en tickets).
- Actualizar imports y quitar bloques de comisión en:
  - `src/lib/printing/pos-sales-report.ts`
  - `src/lib/printing/ticket-print.ts`
  - `src/lib/printing/qz.ts`
  - `src/lib/reporting/monthly-excel-export.ts`
  - `src/lib/reporting/jornada-cashier-report.ts`
  - `src/components/dashboard/ReportsPanel.tsx`
  - Memoria `mem://features/billing/stockia-commission` → remover entrada del index.
- **Correo `jornada-closed-summary.tsx`**: quitar tile "Comisión STOCKIA" y campo `stockia_commission`. KPI hero queda solo con "Ventas brutas" + "Transacciones" + "Ticket promedio".
- **Función `dispatch_jornada_closed_email`**: eliminar `v_commission`, `v_total_net` y `stockia_commission` del payload.

## 2. Mejorar el correo de cierre de jornada

### 2.1 Logo institucional
Agregar `<Img>` en el header del template usando el logo blanco existente. Como los emails no pueden leer assets locales, se sirve desde la URL pública de Lovable:
```
https://app.stockiachile.com/stockia-logo-full-white.png
```
Reemplaza el `<Text>STOCKIA</Text>` actual por la imagen (height 28px, alt "STOCKIA").

### 2.2 Arreglar "Desglose por POS" (actualmente vacío)
**Causa raíz detectada**: la función SQL referencia `pos_locations` y `s.pos_location_id`, pero las columnas/tabla reales son `pos_terminals` y `sales.pos_id` / `ticket_sales.pos_id`. El bloque cae en `EXCEPTION` y devuelve `[]`.

**Fix**: reemplazar en `dispatch_jornada_closed_email`:
- `LEFT JOIN pos_locations pl ON pl.id = s.pos_location_id` → `LEFT JOIN pos_terminals pl ON pl.id = s.pos_id`
- `LEFT JOIN pos_locations pl ON pl.id = ts.pos_id` → `LEFT JOIN pos_terminals pl ON pl.id = ts.pos_id`
- Quitar el `EXCEPTION WHEN OTHERS` que oculta el error (o cambiar a `RAISE WARNING`) para futuros diagnósticos.

### 2.3 Agregar consumo teórico de insumos al correo
Replicar la lógica del botón `IngredientUsageReportButton` dentro del SQL: `sale_items × cocktail_ingredients` agrupado por `product_id` para los 10 insumos más consumidos.

```sql
WITH ings AS (
  SELECT ci.product_id,
         SUM(si.quantity * ci.quantity) AS qty_used
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN cocktail_ingredients ci ON ci.cocktail_id = si.cocktail_id
  WHERE s.jornada_id = p_jornada_id
    AND s.is_cancelled = false
    AND ci.product_id IS NOT NULL
    AND COALESCE(ci.is_mixer_slot, false) = false
  GROUP BY ci.product_id
)
SELECT jsonb_agg(jsonb_build_object(
  'product_name', p.name,
  'quantity', round(qty_used::numeric, 1),
  'unit', CASE WHEN p.capacity_ml > 0 THEN 'ml' ELSE COALESCE(p.unit,'u') END
) ORDER BY qty_used DESC)
FROM ings i JOIN products p ON p.id = i.product_id
LIMIT 10;
```

Nuevo campo `ingredient_usage` en el payload y nueva `<Section>` "Consumo teórico de insumos" en el template (tabla simple: insumo · cantidad).

## Resumen de archivos

**Migration**:
- Reemplaza `dispatch_jornada_closed_email`: fix tablas POS, elimina comisión, agrega `ingredient_usage`.

**Edge function template** (`jornada-closed-summary.tsx`):
- Header con logo Img.
- Quitar bloque comisión.
- Nueva sección Consumo de insumos.

**Frontend** (limpieza de comisión):
- Eliminar `src/lib/commission.ts` y migrar `STOCKIA_PRINT_FOOTER` a `src/lib/branding.ts`.
- Actualizar los 6 archivos que la importan removiendo cálculos/bloques de comisión.
- Actualizar `mem://index.md`.

Sin cambios en `IngredientUsageReportButton` (ya funciona bien).
