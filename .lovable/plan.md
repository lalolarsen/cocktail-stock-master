

# Plan: Plantillas diferenciadas y parsing inteligente por tipo de movimiento

## Resumen

Reemplazar la plantilla única genérica por 3 plantillas específicas (Compra, Reposición, Conteo), cada una con solo las columnas necesarias. Mejorar el fuzzy matching con una tabla de aprendizaje (`learning_product_mappings`) que ya existe. Agregar opción de AI-assisted matching como fallback cuando el fuzzy falla.

## Plantillas diferenciadas

### Compra
Columnas: `producto_nombre | cantidad | formato_ml | costo_neto_unitario`
- Si es botella (ej. 750ml, 5 unidades): usuario pone `750` en formato_ml, `5` en cantidad
- Si es unitario: formato_ml vacío, solo cantidad
- El costo neto unitario (por botella o por unidad) se usa para recalcular CPP

### Reposición
Columnas: `producto_nombre | cantidad | ubicacion_destino`
- Origen siempre = Bodega Principal (implícito)
- Cantidad en unidades (botellas o unidades discretas)
- Ubicación destino: nombre del bar (Barra Principal, Pista, etc.)

### Conteo
Columnas: `producto_nombre | stock_real | ubicacion`
- Stock real en unidades (botellas para volumétricos, unidades para discretos)
- Ubicación: nombre de la ubicación donde se contó

## Parsing inteligente con aprendizaje

1. **Paso 1 — Memoria**: buscar en `learning_product_mappings` por `raw_text` normalizado
2. **Paso 2 — Fuzzy**: si no hay memoria, usar bigram similarity actual
3. **Paso 3 — AI fallback** (opcional): si confidence < 0.5, usar Lovable AI edge function para matching semántico
4. **Aprendizaje**: al aprobar un lote, guardar cada `raw_text → product_id` en `learning_product_mappings` incrementando `times_used` y `confidence`

## Cambios

### 1. Nuevas funciones de generación de plantilla (`excel-inventory-parser.ts`)
- `generateCompraTemplate(products)` → Excel con columnas mínimas + hoja de referencia de productos
- `generateReposicionTemplate(products, locations)` → Excel con columnas mínimas + lista de ubicaciones destino válidas
- `generateConteoTemplate` ya existe, ajustar columnas a `producto_nombre | stock_real | ubicacion`

### 2. Nuevos parsers simplificados (`excel-inventory-parser.ts`)
- Refactorizar `parseCompraSimple`: leer `formato_ml` del Excel (no inferir del producto), validar que `cantidad * formato_ml` sea coherente para botellas
- Refactorizar `parseReposicionSimple`: solo 3 columnas, origen implícito bodega
- Refactorizar `parseConteoSimple`: solo 3 columnas con ubicación por fila

### 3. Integrar aprendizaje en fuzzy matching (`excel-inventory-parser.ts`)
- Nueva función `fuzzyMatchWithLearning(name, products, learnings)` que consulta `learning_product_mappings` antes del bigram
- Al confirmar batch en `InventoryHub.tsx`, guardar los mappings aprendidos

### 4. Actualizar `ExcelUpload.tsx`
- Descargar plantilla específica según `defaultMovementType` en vez de la genérica
- Cargar `learning_product_mappings` junto con datos de referencia
- Pasar learnings a los parsers

### 5. Edge function AI matching (nuevo: `supabase/functions/match-products/index.ts`)
- Recibe array de `{raw_name, candidates: [{id, name}]}` 
- Usa Lovable AI para matching semántico
- Retorna `{raw_name, product_id, confidence}`
- Se invoca solo para filas con confidence < 0.5 después del fuzzy

### 6. Actualizar `InventoryHub.tsx`
- En `handleApprove`, después de aplicar el lote, guardar learnings en `learning_product_mappings`

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/excel-inventory-parser.ts` | 3 generadores de plantilla específicos, parsers refactorizados, integración de learnings |
| `src/components/dashboard/ExcelUpload.tsx` | Plantilla específica por tipo, cargar learnings, AI fallback |
| `src/components/dashboard/InventoryHub.tsx` | Guardar learnings al aprobar |
| `supabase/functions/match-products/index.ts` | Edge function para AI matching |

## Sin cambios de DB
La tabla `learning_product_mappings` ya existe con la estructura necesaria.

