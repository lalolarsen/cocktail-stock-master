

# Plan: Refactorizar "Stock detallado" — Vista de valorización por ubicación

## Resumen

Reemplazar el componente `WarehouseInventory` actual (976 líneas, carga todo al montar) por una vista nueva y ligera con 3 capas: resumen de capital, distribución por ubicación, y detalle filtrable bajo demanda.

## Nueva estructura visual

```text
┌─────────────────────────────────────────────────┐
│  Stock Detallado                                │
│                                                 │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐│
│  │Capital Total│ │Ubicaciones │ │Últ. Actualiz.││
│  │ $12.500.000 │ │     4      │ │ 05 abr 14:30 ││
│  └────────────┘ └────────────┘ └──────────────┘│
│                                                 │
│  ── Distribución por ubicación ──────────────── │
│  Bodega Principal  $8.200.000  65%  42 prods    │
│  Barra 1           $2.800.000  22%  35 prods    │
│  Barra 2           $1.500.000  12%  28 prods    │
│                                                 │
│  ── Detalle (carga bajo demanda) ────────────── │
│  [Selector ubicación] [Buscar] [ML/UNIT]        │
│  sku | nombre | tipo | stock | und | cpp | valor│
│  ...                                            │
└─────────────────────────────────────────────────┘
```

## Cambios

### 1. Reescribir `WarehouseInventory.tsx`

Reemplazar las 976 líneas actuales por un componente nuevo con 3 secciones:

**Capa 1 — Summary cards** (carga inmediata, query liviana):
- Capital total valorizado (SUM de stock × cpp por base)
- Cantidad de ubicaciones activas
- Última actualización (MAX de `stock_balances.updated_at`)
- Query: un solo fetch de `stock_balances` + join con `products` y `stock_locations`

**Capa 2 — Distribución por ubicación** (carga inmediata, misma query):
- Tabla/cards con: ubicación, valor inventario, % del total, productos con stock
- Barra de progreso visual por %
- Calculada en frontend agrupando los balances ya cargados

**Capa 3 — Detalle filtrable** (carga bajo demanda):
- Se muestra colapsado por defecto, se expande al hacer clic o seleccionar ubicación
- Filtros: selector de ubicación, búsqueda por nombre/SKU, toggle ML/UNIT
- Columnas: sku_base, producto_nombre, tipo_consumo, ubicación, stock_actual_base, unidad_base, cpp_actual_base, valor_total_stock
- Usa `isBottle()` para tipo_consumo y cálculo de valor
- Valor = para ML: `stock × (cost_per_unit / capacity_ml)`, para UNIT: `stock × cost_per_unit`
- Paginación o limit inicial de 50 filas

### 2. Optimización de carga

**Carga inicial** (capas 1 y 2): un solo query que trae `stock_balances` con `product_id`, `location_id`, `quantity` + productos (`code`, `name`, `capacity_ml`, `cost_per_unit`, `unit`) + locations (`name`, `type`). Se agrupa en frontend para capital total y distribución.

**Carga detalle** (capa 3): se activa solo cuando el usuario expande o filtra. No se monta la tabla hasta que haya interacción.

### 3. Eliminar complejidad legacy

- Remover: secciones collapsibles por estado (OK/Low/Out), ingreso manual, registro de merma, ajuste de mínimos, chips de filtro por estado, info banner
- Mantener: export CSV (simplificado), prop `isReadOnly` para vista Gerencia
- La vista Gerencia (`isReadOnly`) se unifica con la nueva estructura (ya tiene distribución por ubicación, solo se limpia)

## Archivos a modificar

| Archivo | Acción |
|---|---|
| `src/components/dashboard/WarehouseInventory.tsx` | **Reescribir** — nueva vista de 3 capas |

## Lo que NO se toca

- `InventoryHub.tsx` — sigue siendo el entry point, carga `WarehouseInventory` lazy
- DB / schema
- `ExcelUpload`, `StockReconciliation`, `WasteManagement`
- Lógica de ventas, recetas, redeem

