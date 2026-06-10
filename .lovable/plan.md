## Cambios

### 1. KPIs en vivo — `src/components/dashboard/overview/JornadaKPIPanel.tsx`
Reescribir las 3 tabs actuales (POS / Top / COGS) por **4 tabs accionables**:

1. **Por hora** — `BarChart` (recharts) agrupado por hora local America/Santiago, suma `sales.total_amount + ticket_sales.total`. Header destaca hora pico.
2. **Por POS** — barras horizontales, alcohol vs tickets (lógica actual conservada).
3. **Vendedor** — nuevo: agrupa `created_by` de `sales` + `ticket_sales`, join batch a `profiles.full_name`, top 8.
4. **Top × pago** — top 8 productos con barra apilada efectivo / tarjeta / otro (mapeo `payment_method` → categoría). Footer con mix global.

Auto-refresh cada 30 s, summary strip con total, hora pico y # vendedores.

### 2. Limpieza inventario (componentes muertos)
Borrar (verificado: sin imports externos vivos):
- `RealtimeInventoryDashboard.tsx`, `InventoryHub.tsx`, `InventoryComparisonModule.tsx`
- `WarehouseInventory.tsx`, `WarehouseStockIntake.tsx`, `BulkStockIntakeGrid.tsx`, `ManualStockEntryDialog.tsx`
- `OpenBottlesMonitor.tsx`, `OpenBottleDetailDrawer.tsx`
- `BarReplenishment.tsx`, `ReplenishmentRequestsPanel.tsx`
- `ExternalConsumptionPanel.tsx`, `StockReconciliation.tsx`
- `WasteManagement.tsx`, `WasteRegistrationDialog.tsx`
- `InventoryFreezeBanner.tsx`, `InventoryFreezeToggle.tsx`
- `hooks/useRealtimeInventory.ts`, `hooks/useOpenBottles.ts`
- `lib/reporting/inventory-snapshot-pdf.ts`
- carpeta `components/dashboard/replenishment/` completa
- `components/dashboard/overview/LiveSalesChart.tsx` (reemplazado por KPI panel)

**Conservar** `ReplenishmentRequestDialog.tsx` — lo usa `src/pages/Sales.tsx` (botón "Pedir reposición" del cajero).

### 3. Sidebar — `src/components/AppSidebar.tsx`
Limpiar el union `ViewType` quitando los 10 valores muertos (`inventory`, `replenishment`, `waste`, `botellas`, `external-consumption`, `reconciliation`, `comparison`, `live-inventory`, `shift-counts`, `weekly-count`, `expenses`, `documents`, `finance`, `passline-audit`, `income`). No se agregan ni cambian items visibles.

## Sin cambios
- DB / RLS / edge functions / POS / Bar / Tickets / Cortesías / Lector facturas / Análisis: intactos.
- `useStockData`, `useCOGSData`, `stock_balances`: siguen vigentes.

## Riesgo
Bajo. UI/presentación solamente. Rollback vía History si algo no convence.
