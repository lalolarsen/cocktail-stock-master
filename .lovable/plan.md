

# Plan: Refactor visual del módulo de Inventario — Excel-First

## Resumen

Reemplazar la vista actual de inventario (976 líneas de `WarehouseInventory` que carga toda la data al montar) por una pantalla operativa simple con 4 acciones principales, historial liviano y acceso secundario a detalle/auditoría.

## Nueva estructura visual

```text
┌─────────────────────────────────────────────────┐
│  📦 Inventario                                  │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐│
│  │ Subir    │ │ Subir    │ │ Subir    │ │Desc.││
│  │ Compra   │ │ Repos.   │ │ Conteo   │ │Stock││
│  └──────────┘ └──────────┘ └──────────┘ └─────┘│
│                                                 │
│  ── Resumen rápido ──────────────────────────── │
│  Capital total: $X  │  Última compra: dd/mm     │
│  Último conteo: dd/mm │ Productos: N            │
│                                                 │
│  ── Últimos movimientos ─────────────────────── │
│  (5 filas más recientes de stock_movements)     │
│                                                 │
│  [Ver stock completo]  [Ver historial completo] │
│  (carga lazy WarehouseInventory / detalle)      │
└─────────────────────────────────────────────────┘
```

## Cambios planificados

### 1. Nuevo componente: `src/components/dashboard/InventoryHub.tsx`

Pantalla principal liviana que reemplaza la carga directa de `WarehouseInventory`:

- **4 action cards** arriba: Subir Compra, Subir Reposición, Subir Conteo, Descargar Stock
  - Subir Compra/Repos/Conteo abren el mismo `ExcelUpload` con un filtro de tipo pre-seleccionado
  - Descargar Stock ejecuta la exportación XLSX existente de `ExcelUpload`
- **Resumen rápido** (4 mini-stats): Capital total, productos con stock, último movimiento, alertas de stock bajo
  - Query liviana: `SELECT COUNT(*), SUM(quantity) FROM stock_balances WHERE venue_id = ?` + último movimiento
- **Últimos 5 movimientos** de `stock_movements` (query con limit 5, sin cargar todo)
- **Botones secundarios**:
  - "Ver stock detallado" → abre `WarehouseInventory` en un colapsable o tab
  - "Ver historial" → carga historial completo bajo demanda

### 2. Modificar `ExcelUpload.tsx`

- Agregar prop opcional `defaultMovementType?: "COMPRA" | "TRANSFERENCIA" | "CONTEO"` para pre-filtrar
- El componente se usa embebido dentro de un Dialog que se abre desde las action cards
- Mantener toda la lógica transaccional existente sin cambios

### 3. Modificar `src/pages/Admin.tsx`

- Cambiar el render de `activeView === "inventory"` para usar `InventoryHub` en vez de `WarehouseInventory` directamente
- `WarehouseInventory` se carga lazy dentro de `InventoryHub` solo cuando el usuario lo solicita

### 4. Simplificar sidebar (`AppSidebar.tsx`)

Consolidar la sección "Inventario" del sidebar:
- **Mantener**: Inventario, Productos, Reposición, Proveedores
- **Ocultar del sidebar** (accesibles desde dentro de InventoryHub): Merma, Consumo Externo, Cuadre de Stock
  - Estas acciones ahora se acceden como botones secundarios dentro del hub

### 5. Lazy loading de `WarehouseInventory`

- Convertir el import de `WarehouseInventory` a `React.lazy()` dentro de `InventoryHub`
- Solo se monta cuando el usuario hace clic en "Ver stock detallado"
- Elimina la carga de ~4 queries paralelas pesadas al abrir inventario

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/components/dashboard/InventoryHub.tsx` | **Crear** — pantalla principal liviana |
| `src/components/dashboard/ExcelUpload.tsx` | **Modificar** — agregar prop `defaultMovementType` |
| `src/pages/Admin.tsx` | **Modificar** — usar `InventoryHub` en vez de `WarehouseInventory` |
| `src/components/AppSidebar.tsx` | **Modificar** — reducir ítems de inventario |

## Lo que NO se toca

- `WarehouseInventory.tsx` — se mantiene intacto, solo se carga lazy
- Lógica transaccional de `ExcelUpload`
- DB / schema
- Redeem, recetas, ventas, jornadas
- `StockReconciliation`, `WasteManagement` — se mantienen, acceso desde hub

## Resultado esperado

- Carga inicial del módulo: 1 query liviana (últimos 5 movimientos + counts) vs 4 queries pesadas actuales
- El usuario ve inmediatamente las 4 acciones Excel-first
- Stock detallado solo se carga bajo demanda
- Sidebar más limpio con menos ítems redundantes

