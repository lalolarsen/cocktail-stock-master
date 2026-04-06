

# Plan: Simplificación contable — Solo costo neto, CPP e IVA débito

## Resumen

Eliminar toda la complejidad tributaria (IVA crédito, ILA, IABA, impuestos específicos, prorrateo) del flujo activo. Dejar el sistema enfocado en: **costo neto unitario → CPP → venta neta + IVA débito**.

---

## Cambios por área

### 1. Motor de cálculo de compras (`src/lib/purchase-calculator.ts`)

**Simplificar** eliminando del flujo activo:
- Tipos `TaxCategory`, `HeaderTaxTotals`, `ProrationDiagnostic` — dejar como `NONE` por defecto, no exponer en UI
- Eliminar `TAX_CATEGORY_KEYWORDS`, `detectTaxCategory()`, `getTaxCategoryLabel()`, `TAX_RATES` del flujo visible
- Eliminar campos `tax_category`, `tax_rate`, `tax_details`, `specific_tax_amount`, `inventory_cost_line`, `inventory_unit_cost` de la interfaz `ComputedLine` activa (o dejar como siempre 0/NONE)
- `computePurchaseLine()` debe retornar directamente: **`net_unit_cost`** como único dato de costo relevante
- Eliminar `applyTaxProration()` y toda la lógica de prorrateo

**Resultado**: el motor solo calcula qty × precio unitario (con desc.) = costo neto unitario

### 2. Motor financiero (`src/lib/purchase-financial-engine.ts`)

**Simplificar** `FinancialSummary`:
- Eliminar secciones `tax_credit`, `specific_taxes`
- Mantener solo: `inventory_impact`, `operational_expenses` (simple), `accounts_payable`, `validation`
- La cuadratura ya no considera IVA ni impuestos específicos

### 3. Lector de facturas / Edge function (`supabase/functions/extract-invoice/index.ts`)

**Mantener** la lógica de extracción AI pero:
- El prompt al modelo solo debe pedir: nombre producto, cantidad, precio unitario, total línea
- No pedir IVA, ILA, IABA ni impuestos del documento
- Mantener solo los campos `net_subtotal` y `total_amount` del header (informativo)
- Eliminar extracción de `iva_total`, impuestos específicos por categoría

### 4. UI de revisión de importación (`src/pages/PurchasesImport.tsx`)

- **Eliminar** campos IVA e impuestos del header del documento (grid Neto/IVA/Total → solo Neto y Total)
- **Eliminar** referencia a `TAX_RATES`, `TaxCategory` del import
- La confirmación solo persiste: producto, cantidad, multiplicador, costo neto unitario

### 5. Tabla de revisión (`src/components/purchase/MinimalReviewTable.tsx`)

- Ya está simplificada mostrando "COGS Neto". Mantener como está.
- Eliminar botón "Crear producto" (`Plus` icon) — regla: solo enlazar a existente, no crear desde lector

### 6. Drawer de detalle de línea (`src/components/purchase/LineDetailDrawer.tsx`)

- **Eliminar** sección "Impuesto Clasificado (Informativo)" (líneas 146-166)
- **Eliminar** sección "Impuestos Extraídos de Factura" (líneas 168-207)
- Dejar solo: fórmula de cálculo (pasos 1-4) + resultado costo neto unitario

### 7. Panel de resumen (`src/components/purchase/ImportSummaryPanel.tsx`)

- Ya está simplificado. Eliminar props `ivaAmount` y `registerExpenses` que no se usan visualmente.

### 8. Finanzas MTD (`src/hooks/useFinanceMTD.ts`)

**Simplificar significativamente**:
- Eliminar query de `purchase_imports` para IVA crédito e impuestos específicos
- Eliminar query de `purchase_documents` legacy
- Eliminar campos: `ivaCreditoFacturas`, `ivaCreditoFromImports`, `ivaCreditoTotal`, `ivaNeto`, `specificTaxTotal`, `specificTaxFromInvoices`, `specificTaxFromOpex`, `specificTaxBreakdown`, `marginPostSpecificTax`, todos los forecasts de impuestos específicos
- Mantener: ventas (gross/net/iva débito), COGS, waste, OPEX (simple), margen bruto, resultado operacional
- Resultado operacional = Ventas netas − COGS − Merma − OPEX

### 9. Panel de Finanzas (`src/components/dashboard/FinancePanel.tsx`)

- Ya está bastante limpio. Verificar que no muestre IVA crédito ni impuestos específicos. Actualmente no los muestra — **sin cambios**.

### 10. Estado de Resultados (`src/pages/IncomeStatement.tsx`)

- Limpiar si hay referencias a impuestos específicos o IVA crédito en el desglose
- Mantener estructura: Ingresos → COGS → Margen Bruto → Gastos → Resultado

### 11. Gastos operacionales (`src/components/dashboard/AddOperationalExpenseDialog.tsx`)

- **Eliminar** campos: `specificTax`, `taxNotes`, `vatApplies`, `vatRate` del formulario
- El gasto se registra solo como: monto, categoría, descripción, fecha
- No mezclar con flujo de costo de producto

### 12. Panel de proveedores (`src/components/dashboard/ProveedoresPanel.tsx`)

- Eliminar columnas IVA de la tabla de importaciones
- Mantener: Fecha, Proveedor, Doc#, Neto, Total, Estado

### 13. Limpieza de lenguaje UI

Buscar y reemplazar en toda la app:
- Eliminar menciones de "IVA crédito", "ILA", "IABA", "impuesto específico" de labels y textos de ayuda
- Renombrar donde aplique para usar "costo neto" consistentemente

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/purchase-calculator.ts` | Neutralizar tax logic (todo NONE/0) |
| `src/lib/purchase-financial-engine.ts` | Eliminar secciones tributarias |
| `supabase/functions/extract-invoice/index.ts` | Simplificar prompt AI |
| `src/pages/PurchasesImport.tsx` | Eliminar campos IVA/impuestos, eliminar crear producto |
| `src/components/purchase/MinimalReviewTable.tsx` | Eliminar botón crear producto |
| `src/components/purchase/LineDetailDrawer.tsx` | Eliminar secciones de impuestos |
| `src/components/purchase/ImportSummaryPanel.tsx` | Limpiar props no usados |
| `src/hooks/useFinanceMTD.ts` | Eliminar queries y campos tributarios |
| `src/pages/IncomeStatement.tsx` | Verificar limpieza |
| `src/components/dashboard/AddOperationalExpenseDialog.tsx` | Simplificar formulario |
| `src/components/dashboard/ProveedoresPanel.tsx` | Eliminar columna IVA |
| `src/components/purchase/DiagnosticPanel.tsx` | Limpiar refs tributarias |

---

## Lo que NO se toca

- Autenticación, multi-venue, productos, inventario, ventas, jornadas, recetas, redeem, trazabilidad
- DB schema (no se eliminan columnas, solo se dejan de usar)
- `useCOGSData.ts` — ya funciona correctamente con costo neto
- Lógica de CPP existente (ya usa `net_unit_cost` / `cost_per_unit`)

## Preparado para futuro (interno, sin UI)

- Tipos `TaxCategory` se mantienen en el código pero con valor `NONE` por defecto
- Columnas de DB como `iaba_10_total`, `ila_destilados_total` siguen existiendo pero no se populan
- La función `detectTaxCategory()` se mantiene pero no se invoca desde UI

## Flujo final simplificado

```text
FACTURA → Lector AI extrae líneas
  → Cada línea: nombre + qty + precio unitario
  → Enlace obligatorio a producto existente (o revisión manual)
  → Costo neto unitario = precio × (1 - desc%)
  → Confirmar → actualiza CPP del producto

VENTA → total = neto + IVA débito (19%)
  → COGS = CPP × cantidad consumida
  → Margen = Neto − COGS
```

