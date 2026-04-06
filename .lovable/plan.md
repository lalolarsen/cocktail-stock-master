

# Plan: Flujo Excel con validación humana obligatoria

## Resumen

Transformar el flujo actual (subir Excel → preview → aplicar inmediatamente) en un flujo de 2 etapas: **subir → preview + guardar como pendiente** y luego **aprobar/rechazar desde un panel de lotes pendientes**. Simplificar los Excel de entrada a columnas mínimas por tipo.

## Cambios de base de datos

### Nueva tabla: `stock_import_batches`

Tabla central para el flujo de aprobación:

```sql
CREATE TABLE public.stock_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  batch_type text NOT NULL CHECK (batch_type IN ('COMPRA','TRANSFERENCIA','CONTEO')),
  status text NOT NULL DEFAULT 'pendiente_aprobacion' CHECK (status IN ('pendiente_aprobacion','aprobado','rechazado')),
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  file_name text,
  summary_json jsonb NOT NULL DEFAULT '{}',
  row_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0
);

CREATE TABLE public.stock_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES stock_import_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}',
  product_id uuid REFERENCES products(id),
  product_name_excel text,
  product_name_matched text,
  match_confidence text CHECK (match_confidence IN ('alta','media','baja','sin_match')),
  tipo_consumo text,
  unidad_detectada text,
  location_destino_id uuid,
  location_origen_id uuid,
  quantity numeric,
  unit_cost numeric,
  computed_base_qty numeric,
  stock_teorico numeric,
  stock_real numeric,
  errors text[] DEFAULT '{}',
  is_valid boolean NOT NULL DEFAULT false
);
```

RLS: lectura por venue, escritura admin.

### Excel simplificado por tipo

**COMPRA** (4 columnas mínimas):
- `documento`, `producto_nombre`, `costo_compra`, `cantidad`
- Sistema auto-completa: destino=Bodega Principal, formato/unidad desde producto, SKU desde match

**REPOSICION** (4 columnas mínimas):
- `ubicacion_destino`, `producto_nombre`, `cantidad`, `fecha`
- Sistema auto-completa: origen=Bodega Principal, unidad desde producto

**CONTEO** (sistema genera Excel pre-llenado):
- Columnas: `producto`, `unidad`, `formato`, `stock_teorico`, `stock_real` (solo esta la llena el usuario)

## Cambios de frontend

### 1. Nuevo parser simplificado en `excel-inventory-parser.ts`

- Agregar funciones `parseCompraSimple()`, `parseReposicionSimple()`, `parseConteoSimple()`
- Cada una acepta las columnas mínimas y resuelve producto por **similitud de nombre** (fuzzy match) en vez de SKU obligatorio
- Calcular `match_confidence`: alta (exact match code), media (nombre similar >80%), baja (>60%), sin_match (<60%)
- Auto-completar tipo_consumo, unidad, formato desde el producto encontrado en catálogo

### 2. Reescribir `ExcelUpload.tsx`

**Al subir archivo:**
1. Parsear con el parser simplificado según tipo
2. Mostrar preview por fila con: producto Excel, producto asociado, formato detectado, confianza del match, acción, errores
3. Si hay filas `sin_match` → bloquear botón "Guardar"
4. Botón "Guardar como pendiente" → inserta en `stock_import_batches` + `stock_import_rows`, estado `pendiente_aprobacion`
5. NO aplica ningún cambio a stock

### 3. Reescribir `StockImportPreviewDialog.tsx`

Agregar **resumen ejecutivo** antes del detalle por fila:

- **Siempre**: tipo operación, total filas, productos afectados, impacto total en stock, variación valorización
- **COMPRA**: monto total, CPP antes vs después por producto
- **REPOSICION**: total unidades/ml movidos, ubicación destino
- **CONTEO**: ajustes positivos, mermas, diferencia valorizada total

Cambiar botón de "Confirmar" a "Guardar como pendiente".

### 4. Nuevo componente: panel de lotes pendientes en `InventoryHub.tsx`

Sección visible en el hub (entre stats y movimientos recientes):

- Lista de lotes con: tipo, fecha, quién subió, filas válidas/errores, estado (badge color)
- Click en lote → abre drawer/dialog con resumen ejecutivo + detalle por fila
- Botones: **Aprobar** (aplica cambios a stock usando la lógica existente de `processCompras/Transferencias/Conteos`) y **Rechazar** (marca como rechazado)
- Al aprobar: registra `approved_by`, `approved_at`, ejecuta las transacciones de stock, cambia estado a `aprobado`

### 5. Generar Excel de conteo pre-llenado

Nuevo botón "Generar conteo" en hub que:
- Pide seleccionar ubicación
- Genera Excel con productos de esa ubicación + stock teórico
- Usuario solo llena columna `stock_real`
- Al subir, el parser compara teórico vs real

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| Migración SQL | **Crear** — `stock_import_batches` + `stock_import_rows` + RLS |
| `src/lib/excel-inventory-parser.ts` | **Modificar** — agregar parsers simplificados + fuzzy match |
| `src/components/dashboard/ExcelUpload.tsx` | **Reescribir** — flujo de guardar como pendiente |
| `src/components/dashboard/StockImportPreviewDialog.tsx` | **Reescribir** — resumen ejecutivo + preview por fila con confianza |
| `src/components/dashboard/InventoryHub.tsx` | **Modificar** — agregar panel de lotes pendientes |

## Lo que NO se toca

- Lógica transaccional de stock (se reutiliza tal cual al aprobar)
- DB de stock_balances, stock_movements, products
- Ventas, recetas, redeem, jornadas
- Autenticación, multi-venue

## Flujo final

```text
Usuario sube Excel simplificado
  → Parser detecta tipo + resuelve productos por nombre
  → Preview: fila por fila con confianza del match
  → Resumen ejecutivo del impacto
  → "Guardar como pendiente" → DB (sin tocar stock)

Admin abre panel de pendientes
  → Ve resumen + detalle
  → Aprobar → ejecuta transacciones → stock actualizado
  → Rechazar → marca descartado
```

