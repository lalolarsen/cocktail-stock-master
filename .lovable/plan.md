

# Plan de Implementacion: Modulo Lector de Facturas (Proveedores)

## Resumen Ejecutivo

El documento define especificaciones tecnicas y reglas de negocio para sistematizar la conversion de facturas de proveedores en registros de inventario y gastos. La implementacion actual cubre parcialmente estos requisitos pero requiere mejoras significativas en varias areas.

## Estado Actual vs. Requisitos del Documento

| Requisito | Estado Actual | Accion Requerida |
|-----------|---------------|------------------|
| Acceso Restringido (Feature Flag) | Implementado | Sin cambios |
| Estados de Documento (DRAFT, PARSED, etc.) | Parcialmente | Expandir matriz de estados |
| Validacion de Cabecera (Neto/IVA/Total) | No implementado | Agregar campos y validacion |
| UoM y Factor de Conversion | No implementado | Agregar logica de conversion |
| CPP (Costo Promedio Ponderado) | Simple average actual | Implementar formula correcta |
| Clasificacion de Items (Inventario/Gasto) | Implementado | Sin cambios mayores |
| Auditoria de Cambios | Basica | Expandir trazabilidad |
| Checklist Pre-Confirmacion | No implementado | Agregar validaciones |
| Estados de Linea de Item | No implementado | Agregar columna status |

---

## Fase 1: Modelo de Datos (Migracion SQL)

### 1.1 Expandir `purchase_documents`

Agregar campos faltantes segun especificacion:

```text
- net_amount NUMERIC          -- Monto neto
- iva_amount NUMERIC          -- IVA
- total_amount_gross NUMERIC  -- Total bruto
- status (expandir valores)   -- DRAFT, PARSED, IN_REVIEW, CONFIRMED, VOID, ERROR
- audit_trail JSONB           -- Bitacora de cambios
```

### 1.2 Expandir `purchase_items`

Agregar campos para UoM y estados:

```text
- extracted_uom TEXT              -- Unidad extraida (Unidad, Caja, Pack)
- conversion_factor NUMERIC       -- Factor de conversion
- normalized_quantity NUMERIC     -- Cantidad normalizada
- normalized_unit_cost NUMERIC    -- Costo normalizado
- classification TEXT             -- inventory | expense
- status TEXT                     -- PENDING_MATCH, MATCHED, MARKED_AS_EXPENSE, READY, APPLIED
- expense_category TEXT           -- Categoria de gasto si aplica
```

### 1.3 Crear tabla `purchase_import_audit`

Para trazabilidad completa:

```text
- id UUID
- purchase_document_id UUID
- action TEXT (uploaded, parsed, item_matched, item_reclassified, confirmed, etc.)
- user_id UUID
- previous_state JSONB
- new_state JSONB
- created_at TIMESTAMPTZ
```

---

## Fase 2: Logica de CPP (Costo Promedio Ponderado)

### Formula Financiera

```text
Nuevo CPP = (Stock Existente * CPP Actual + Cantidad Ingresada * Costo Factura) 
            / (Stock Existente + Cantidad Ingresada)
```

### Casos Especiales

1. **Stock Cero**: CPP = Costo de factura directamente
2. **Exclusion de Gastos**: Items marcados como GASTO no afectan CPP
3. **Factor de Conversion**: Normalizar cantidad y costo antes del calculo

### Modificacion de Funcion `confirm_purchase_intake`

Reemplazar la logica actual de "promedio simple" por CPP real:

```text
-- Actual (incorrecto):
cost_per_unit = (cost_per_unit + v_unit_cost) / 2

-- Nuevo (CPP correcto):
cost_per_unit = CASE 
  WHEN current_stock = 0 OR cost_per_unit IS NULL OR cost_per_unit = 0 THEN v_normalized_cost
  ELSE ((current_stock * cost_per_unit) + (v_normalized_qty * v_normalized_cost)) 
       / (current_stock + v_normalized_qty)
END
```

---

## Fase 3: Edge Function `parse-invoice`

### Mejoras al Prompt de IA

Extraer campos adicionales:

```text
{
  "provider_name": "...",
  "provider_rut": "...",
  "document_number": "...",
  "document_date": "YYYY-MM-DD",
  "net_amount": number,        // NUEVO
  "iva_amount": number,        // NUEVO  
  "total_amount": number,      // NUEVO
  "line_items": [
    {
      "raw_product_name": "...",
      "quantity": number,
      "uom": "string",         // NUEVO: Unidad, Caja, Pack
      "unit_price": number,
      "total": number
    }
  ]
}
```

### Validacion de Coherencia Tributaria

Agregar verificacion post-extraccion:

```text
- Verificar: Neto + IVA ≈ Total (tolerancia < 1.0)
- Verificar: Suma de lineas ≈ Neto (tolerancia < 1.0)
- Marcar discrepancias para revision manual
```

---

## Fase 4: Frontend - PurchasesImport.tsx

### 4.1 Expandir Validacion de Cabecera

Agregar campos editables:

```text
- Monto Neto
- IVA
- Total Bruto
- Indicador de coherencia (check verde/rojo)
```

### 4.2 Agregar Manejo de UoM por Linea

Permitir configurar:

```text
- UoM original (extraido)
- Factor de conversion (ej: 1 caja = 12 unidades)
- Cantidad normalizada (calculada automaticamente)
- Costo unitario normalizado (calculado automaticamente)
```

### 4.3 Checklist Pre-Confirmacion Visual

Mostrar antes de confirmar:

```text
[ ] Venue_id coincide con contexto de usuario
[ ] Usuario tiene privilegios ADMIN/MANAGER
[ ] 100% items de inventario tienen product_id
[ ] Sumatoria coincide con total (tolerancia < 1.0)
[ ] No existen folios duplicados para el proveedor
```

### 4.4 Expandir Estados de Item

Mostrar estado de cada linea:

```text
- PENDING_MATCH (amarillo)
- MATCHED (verde)
- MARKED_AS_EXPENSE (naranja)
- READY (azul)
- APPLIED (gris, bloqueado)
```

---

## Fase 5: Auditoria y Trazabilidad

### Eventos a Registrar

```text
- document_uploaded: Carga inicial del archivo
- document_parsed: Extraccion completada
- header_edited: Cambio en datos de cabecera
- item_matched: Producto asociado a linea
- item_reclassified: Cambio inventario <-> gasto
- uom_adjusted: Factor de conversion modificado
- document_confirmed: Confirmacion final
- document_voided: Anulacion
```

### Visualizacion de Historial

Agregar panel colapsable mostrando timeline de cambios por documento.

---

## Secuencia de Implementacion

```text
1. Migracion SQL (schema + funcion CPP)
   |
2. Actualizar Edge Function parse-invoice
   |
3. Actualizar Frontend PurchasesImport.tsx
   |-- Campos de cabecera expandidos
   |-- Manejo de UoM y conversiones
   |-- Checklist pre-confirmacion
   |-- Estados de linea visuales
   |
4. Agregar tabla y logica de auditoria
   |
5. Testing integral
```

---

## Seccion Tecnica: Detalles de Implementacion

### Migracion SQL Detallada

```sql
-- 1. Expandir purchase_documents
ALTER TABLE purchase_documents 
ADD COLUMN IF NOT EXISTS net_amount NUMERIC,
ADD COLUMN IF NOT EXISTS iva_amount NUMERIC,
ADD COLUMN IF NOT EXISTS total_amount_gross NUMERIC,
ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]';

-- Expandir valores de status (CHECK constraint si existe)
-- Valores: pending, processing, ready, parsed, in_review, confirmed, void, error

-- 2. Expandir purchase_items  
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS extracted_uom TEXT DEFAULT 'Unidad',
ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS normalized_quantity NUMERIC,
ADD COLUMN IF NOT EXISTS normalized_unit_cost NUMERIC,
ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'inventory',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_match',
ADD COLUMN IF NOT EXISTS expense_category TEXT;

-- 3. Crear tabla de auditoria
CREATE TABLE purchase_import_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_document_id UUID REFERENCES purchase_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  previous_state JSONB,
  new_state JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS para auditoria
ALTER TABLE purchase_import_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view audit for their venue docs"
ON purchase_import_audit FOR SELECT
USING (EXISTS (
  SELECT 1 FROM purchase_documents pd 
  WHERE pd.id = purchase_document_id 
  AND pd.venue_id = get_user_venue_id()
));
```

### Funcion CPP Corregida

```sql
-- Dentro de confirm_purchase_intake, reemplazar:
UPDATE products 
SET 
  current_stock = current_stock + v_normalized_qty,
  cost_per_unit = CASE 
    WHEN current_stock = 0 OR cost_per_unit IS NULL OR cost_per_unit = 0 
      THEN v_normalized_cost
    ELSE ROUND(
      ((current_stock * cost_per_unit) + (v_normalized_qty * v_normalized_cost)) 
      / (current_stock + v_normalized_qty), 
      2
    )
  END,
  updated_at = now()
WHERE id = v_product_id;
```

### Interfaz TypeScript Actualizada

```typescript
interface EditableItem extends PurchaseItem {
  // ... campos existentes ...
  
  // Nuevos campos UoM
  extracted_uom: string;
  conversion_factor: number;
  normalized_quantity: number;
  normalized_unit_cost: number;
  
  // Estados expandidos
  item_status: 'pending_match' | 'matched' | 'marked_as_expense' | 'ready' | 'applied';
}
```

---

## Archivos a Modificar/Crear

| Archivo | Accion | Descripcion |
|---------|--------|-------------|
| `supabase/migrations/XXXX_invoice_reader_v2.sql` | Crear | Schema expandido + CPP |
| `supabase/functions/parse-invoice/index.ts` | Modificar | Extraer campos adicionales |
| `src/pages/PurchasesImport.tsx` | Modificar | UI expandida completa |
| `src/components/purchase/UoMConversionDialog.tsx` | Crear | Dialog para conversion |
| `src/components/purchase/PreConfirmChecklist.tsx` | Crear | Checklist visual |
| `src/components/purchase/ImportAuditTimeline.tsx` | Crear | Timeline de auditoria |

---

## Consideraciones de Multi-Tenancy

Todas las nuevas tablas y consultas mantendran el aislamiento por `venue_id`:

- `purchase_import_audit` hereda venue via `purchase_document_id`
- RLS policies aplicadas en todas las tablas
- Consultas en Edge Function filtradas por venue del documento

