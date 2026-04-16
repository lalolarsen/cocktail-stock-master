

## Diagnóstico

El usuario sube la plantilla CONTEO con 85 filas (1 hint + 84 productos). Solo ~50 tienen `stock_real`; el resto está en blanco porque no contó esos productos. El parser actual (`parseConteoSimple` en `excel-inventory-parser.ts` línea 438) marca **toda fila con `stock_real` vacío como inválida** ("Stock real requerido ≥ 0"), incluyendo:

1. **Fila hint** (`# Botellas: ingresa stock_real en ML...`) — el comentario en `generateConteoTemplateByLocation` dice "will be ignored" pero el parser no la ignora, genera error "sin_match".
2. **Productos no contados** (stock_real en blanco) — se marcan inválidos en vez de omitirse.

Resultado: el preview muestra ~35 errores y el botón Confirmar queda con muy pocas filas válidas o el usuario lo percibe como roto. Los flujos COMPRA/REPOSICIÓN tienen el mismo patrón (filas vacías = error en lugar de skip).

## Solución

### A. Skip inteligente de filas vacías y comentarios

En `parseConteoSimple`, `parseCompraSimple`, `parseReposicionSimple`:

- **Skip silencioso** (no emitir fila ni error) cuando:
  - `producto_nombre` empieza con `#` (comentario/hint).
  - `producto_nombre` está vacío Y todos los campos de cantidad también.
  - **Específico CONTEO:** `stock_real` está vacío/null → skip (operador no contó ese producto).
  - **Específico COMPRA/REPOSICIÓN:** `cantidad` y `cantidad_ml` ambos vacíos → skip.

- Solo emitir error si el operador puso algo (nombre + cantidad parcial pero inválida).

### B. Heurística ml/botellas refinada

Mantener la regla "< 50 → botellas, ≥ 50 → ml" que ya está, **pero**:
- Si el valor es entero pequeño (≤ capacity_ml/100) y product es botella → tratar como botellas enteras/decimales.
- Documentar claramente en el hint del template.

### C. Hint mejorado y robusto

En `generateConteoTemplateByLocation`:
- Mover el hint a una columna separada o a un sheet "Instrucciones" para que no aparezca como fila de datos.
- Alternativa más simple: marcar el hint con un prefijo `#` y asegurar que el parser lo ignore por código (ya estará por A).

### D. Mensaje de resumen claro

En `StockImportPreviewDialog` (sección CONTEO):
- Mostrar "X productos contados / Y omitidos (sin contar)" en vez de tratar omitidos como errores.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/lib/excel-inventory-parser.ts` | Skip de filas hint/vacías en los 3 parsers; ajuste de validación |
| `src/components/dashboard/StockImportPreviewDialog.tsx` | Etiqueta "omitidos" para CONTEO en lugar de errores |

## Memoria

Actualizar `mem://features/inventory/movement-logic-compra-transferencia-conteo`: añadir regla "filas con producto vacío o `#` se omiten silenciosamente; en CONTEO, `stock_real` vacío significa 'no contado' (skip), no error".

