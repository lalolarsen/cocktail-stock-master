

# Plan: Mejora de Consumo Externo + Exportación de Inventario + Cuadre de Stock

## Resumen

Tres mejoras interconectadas para el flujo semanal de auditoría de inventario:

1. **Simplificar Consumo Externo** — Entrada rápida tipo "50 de Absolut, 15 de Red Bull" por ubicación, sin el concepto de lotes/períodos innecesario
2. **Exportación de inventario para conteo** — CSV/Excel optimizado para comparación teórico vs real
3. **Módulo de Cuadre de Inventario** — Ingresar conteo real y generar ajustes automáticos

---

## 1. Simplificar ExternalConsumptionPanel

**Problema actual**: El flujo requiere crear lote → seleccionar período → agregar líneas una por una → confirmar → aplicar. Demasiados pasos para "se contaron 50 tickets de un producto".

**Nuevo flujo**:
- Vista principal: seleccionar ubicación + tabla editable rápida (producto | cantidad) 
- Agregar productos con búsqueda rápida, ingresar cantidad, siguiente
- Un solo botón "Guardar borrador" que crea el lote con todas las líneas
- Botón "Confirmar y aplicar" (admin) en la misma vista
- Eliminar selector de período start/end — usar solo la fecha del registro
- Eliminar selector de source_type (cover_manual/totem_manual) — simplificar a un solo tipo "externo"
- Historial de lotes anteriores colapsado abajo

**Archivo**: `src/components/dashboard/ExternalConsumptionPanel.tsx` — reescritura completa

---

## 2. Exportación de inventario para conteo físico

**Ya existe** `handleExportCSV` en WarehouseInventory. Mejorar para que sea útil como planilla de conteo:

- Agregar columna vacía "Conteo Real" para que el usuario la llene a mano o en Excel
- Agregar columna "Diferencia" (fórmula si es Excel, vacía en CSV)
- Opción de exportar en formato Excel (.xlsx) con formato listo para imprimir
- Ordenar por categoría/subcategoría para facilitar el conteo en bodega
- Botón más visible: "Descargar planilla de conteo"

**Archivo**: `src/components/dashboard/WarehouseInventory.tsx` — modificar `handleExportCSV` + agregar opción XLSX

---

## 3. Módulo de Cuadre de Inventario (nuevo)

Después del conteo comparativo, el usuario necesita ingresar el stock real para cuadrar.

**Componente**: `src/components/dashboard/StockReconciliation.tsx`

**Flujo**:
1. Seleccionar ubicación
2. Cargar todos los productos con stock teórico actual
3. Tabla editable: Producto | Stock Teórico | Stock Real (input) | Diferencia (calculada)
4. Resaltar diferencias en rojo (faltante) o azul (sobrante)
5. Botón "Aplicar cuadre" que:
   - Genera movimientos de tipo `stock_reconciliation` (positivos o negativos) para cada diferencia
   - Registra quién hizo el cuadre y cuándo
   - Deja el stock_balances exactamente en el valor real ingresado

**Base de datos**: Usar `stock_movements` existente con un nuevo `movement_type` = `reconciliation` (o usar la columna reason). No se necesitan tablas nuevas.

**Migración**: Agregar `'reconciliation'` como valor válido en movement_type si es enum, o simplemente usar el campo `reason`.

**Acceso**: Solo admin/gerencia

**Archivo nuevo**: `src/components/dashboard/StockReconciliation.tsx`
**Modificar**: `src/pages/Admin.tsx` — agregar pestaña/sección de Cuadre

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/ExternalConsumptionPanel.tsx` | Reescritura: flujo rápido de entrada |
| `src/components/dashboard/WarehouseInventory.tsx` | Mejorar exportación CSV + agregar XLSX |
| `src/components/dashboard/StockReconciliation.tsx` | **Nuevo** — módulo de cuadre |
| `src/pages/Admin.tsx` | Integrar StockReconciliation |
| Migración SQL | Agregar movement_type reconciliation si necesario |

