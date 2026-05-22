## Objetivo

Hacer que el lector de facturas reconozca correctamente el formato CCU (las 3 facturas subidas) y mejore el auto-mapeo guardando el **código del proveedor como SKU**, sin romper lo que ya funciona.

## Lo que confirmamos contigo

- **Código CCU** → guardar como SKU para auto-match (ej: 871240 → Red Bull Tradicional).
- **ILA / IABA** → siguen excluidos del costo (NETO sin ILA, regla actual).
- **Flete (cód 9999)** → se sigue ignorando.
- **Multiplicador** → Cantidad (cajas) × multiplicador de la descripción = unidades reales.

## Cambios

### 1. DB — agregar `supplier_sku` a la memoria de mapeos

Migración pequeña sobre `learning_product_mappings`:

- Nuevo campo `supplier_sku TEXT NULL`.
- Nuevo índice `(venue_id, supplier_rut, supplier_sku)` para lookup rápido.
- No rompe registros existentes (campo opcional).

### 2. Edge function `extract-invoice` — prompt y parser afinados al formato CCU

**Prompt al modelo (Gemini):**
- Pedir explícitamente las columnas del formato CCU: `Código`, `Descripción`, `Grado Alcoh`, `UM`, `Cantidad`, `Precio Unit`, `% Descuento`, `Valor`, `[P.U.] Unidad`.
- Nuevo campo por línea: `supplier_code` (el código numérico, ej "871240").
- Pedir tomar `NETO` como `net_total_text` y `TOTAL FACTURA` como `gross_total_text`, ignorando IVA / ILA VIN / ILA CER / IABA (no se cargan a costo).
- Reforzar que líneas con código `9999` o descripción "Flete de Mercaderías" se marcan `line_type: "expense"` y se descartan.
- Aceptar fotos rotadas / con sombra (las 3 facturas están sobre un piso oscuro).

**Parser:**
- Persistir `supplier_code` (alias SKU) en cada línea extraída.
- **Orden de auto-match** (nuevo):
  1. `supplier_sku` + `supplier_rut` en `learning_product_mappings` (match exacto por código CCU del mismo proveedor).
  2. Patrón RedBull / Mixer (como hoy).
  3. `raw_text` en `learning_product_mappings` (como hoy).
- Confirmar línea → guardar el aprendizaje incluyendo `supplier_sku` para que la próxima factura del mismo proveedor matchee al instante.

### 3. Mejorar detección de multiplicador para CCU

Agregar patrones que aparecen en las facturas subidas:
- `6PFX4-LAT350` / `4PCX6-VNR330` / `4PCK4` → `N x M` (ya cubierto).
- `12PF-PET 600CC` → 12 unidades.
- `PET1500X6-TR` / `PET1600X6-TR` → 6 unidades (X<n> al final).
- `24PF-LAT250` → 24 unidades.
- Tests rápidos en `purchase-calculator.test.ts` para los 10 casos vistos en las 3 fotos.

### 4. UI — mostrar código del proveedor en la revisión

En `MinimalReviewTable.tsx` (panel de revisión de líneas):
- Nueva columna **Cód.** con `supplier_code` (solo lectura, gris pequeño).
- Al confirmar la línea, el código viaja al `learning_product_mappings` (no requiere UI extra).

## Out of scope

- Cambiar reglas de CPP, IVA o ILA.
- Tocar el flujo de Bodega / Replenishment / Transferencias.
- Reconocer facturas de otros proveedores distintos a CCU (el prompt es genérico igual, pero solo verificamos contra CCU).

## Archivos a tocar

- `supabase/migrations/...` (nueva, agrega `supplier_sku`).
- `supabase/functions/extract-invoice/index.ts` (prompt + parser + auto-match).
- `src/components/purchase/MinimalReviewTable.tsx` (columna Cód.).
- `src/lib/purchase-calculator.ts` + `src/lib/purchase-calculator.test.ts` (multiplicadores).
- Persistir SKU al confirmar: revisar `src/pages/ProveedoresImportDetail.tsx` para incluir `supplier_sku` en el upsert a `learning_product_mappings`.
