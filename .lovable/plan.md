
# Plan definitivo: STOCKIA → POS puro + análisis de insumos vía facturas

## Concepto

STOCKIA deja de ser un sistema DiStock y se convierte en:

1. **POS puro** (Alcohol + Tickets) que imprime **cover grande + comprobante**, sin QR.
2. **Lector de facturas** como módulo protagónico de análisis de compras.
3. **Reporte de gasto de insumos** basado en ventas POS (cantidad vendida × receta = consumo teórico).
4. **Catálogo de insumos + Carta con recetas** se conserva: es la columna vertebral que conecta venta → consumo → compra.

Se elimina todo lo relacionado a stock físico, /bar, QRs y EERR.

---

## 1. Catálogo de insumos y Carta — se conservan (correcciones clave)

> Aclaración nueva: el catálogo de productos NO desaparece. Es esencial para:
> - Que el **lector de facturas** matchee cada línea contra un `sku_base` y construya histórico de precios.
> - Que la **Carta (recetas)** convierta una venta de cocktail en cantidades concretas de insumos consumidos.
> - Que el **reporte de gasto de insumos** sume consumos reales por insumo, no solo "productos vendidos".

### Modelo simplificado

- **Producto-insumo** (`products`): identificador `sku_base`, nombre, categoría, formato (ej. PET 1500cc × 6), precio de referencia opcional. **Se mantiene** `sku_base` y la lógica de SKU para el lector de facturas. Se eliminan los campos puramente físicos del UI (`capacity_ml`, lógica de "es botella") aunque se conserven en DB.
- **Producto-vendible / Carta** (`cocktails` + `cocktail_ingredients`): receta que define qué insumos (y qué cantidad) consume cada ítem vendible del POS. **Se mantiene tal cual**.
- **Add-ons** (`cocktail_addons`, `product_addons`): se mantienen como modificadores de precio.

### Lógica de consumo

Una venta en POS de "Gin Tonic" genera:
- 1 `sale_item` (Gin Tonic, qty 1, precio X).
- Implícitamente consume: 60ml Gin + 1 lata Schweppes Tonic + 1 rodaja limón (según receta).
- El **reporte de gasto de insumos** explota cada `sale_item` por su receta y suma cantidades por `sku_base`.
- Para productos vendibles **sin receta** (ej. cerveza vendida directa), el insumo = el propio producto, qty = qty vendida.

---

## 2. Flujo POS nuevo (sin QR)

Al finalizar una venta en cualquier POS (Alcohol o Tickets):

- **Pieza 1 — Cover del cliente**: ticket grande con detalle de productos en tipografía generosa (categoría, nombre, cantidad, addons), número de venta, fecha/hora, vendedor. **Sin QR, sin código de barras.**
- **Pieza 2 — Comprobante para el vendedor**: ticket compacto que se queda el vendedor como respaldo físico (número de venta, total, método de pago, productos, comisión STOCKIA).
- Opcional: documento tributario (boleta/factura) sigue igual que hoy.

El cover físico reemplaza al QR como evidencia que el cliente entrega al barman/staff. No hay validación digital posterior.

---

## 3. Cortesías sin QR — integradas al reporte POS

> Aclaración nueva: las cortesías generadas aparecen explícitamente en el **reporte de ventas por POS** (no en un reporte separado).

- El admin/vendedor genera una cortesía (productos + motivo + beneficiario).
- Al confirmar se **imprime un cover físico** idéntico al de venta, con etiqueta destacada **"CORTESÍA — $0"** y el motivo.
- Se registra en `courtesy_redemptions` con `metadata.physical_cover = true`. Sin `pickup_token`, sin QR.
- **En el reporte de ventas POS**:
  - Sección dedicada **"Cortesías de la jornada"** con: hora, beneficiario, productos, motivo, autorizó.
  - Subtotal "Cortesías $0" no suma a caja pero **sí cuenta para gasto de insumos** (la cortesía consume receta igual que una venta).
- Mantiene el reporte PDF de cortesías por jornada existente, pero ahora también aparecen embedded en el reporte de cajero.

---

## 4. Lector de facturas — módulo protagónico

Se mantiene la edge function `extract-invoice` + `parse-invoice` y el flujo de revisión (`ProveedoresImportDetail`, `MinimalReviewTable`) con énfasis analítico.

### Catálogo-first sigue siendo regla

El lector solo confirma líneas que matcheen un `sku_base` existente en el catálogo de insumos. Si no existe, el admin debe **crear el insumo primero** (flujo actual de PendingCatalog se conserva, simplificado).

### Métricas nuevas (vistas del módulo)

1. **Compras semanales**: agregación de facturas confirmadas por semana ISO con totales por proveedor y por insumo.
2. **Histórico de precio por insumo**: gráfico de evolución de costo unitario neto en el tiempo (de `purchase_import_lines`).
3. **Relación venta vs compra por insumo**: comparación entre unidades compradas y **unidades teóricamente consumidas** (calculadas desde `sale_items` × recetas) por rango. Indicador de "tasa de uso" o variación atribuible a merma/error.
4. **Top insumos por gasto / por variación de precio**.

Todo se calcula desde `purchase_import_lines` (compras) y `sale_items` + `cocktail_ingredients` (consumo teórico). Sin stock, sin CPP, sin replenishment.

---

## 5. Reporte de gasto de insumos (reemplaza Reporte de Canjes)

- Sustituye `RedeemReportButton` y el PDF de canjes.
- Fuente: `SUM(sale_items.quantity × cocktail_ingredients.cantidad)` agrupado por `sku_base`, por jornada o rango.
- Incluye consumos derivados de **cortesías** (mismo cálculo).
- UX: mismo formato térmico 80mm + export, pero el dato es consumo teórico de insumos, no redenciones.

---

## 6. Eliminaciones

### Páginas y rutas
- `/bar` (Bar.tsx) y todo el flujo de bartender.
- `/admin/pickup-tokens`, `/admin/pickups`.
- `/admin/reports/estado-resultados` (IncomeStatement).
- `/admin/catalog/pending` (solo si era específico a stock; revisar si lo necesita el lector).

### Sidebar admin
- **Inventario completo**: live-inventory, replenishment, botellas, mermas, conteos, weekly-count, external-consumption, passline-audit, reconciliation, comparison.
- **EERR / Income Statement**.
- Se conservan: Dashboard, Jornadas, POS, Anulaciones, Productos (insumos), Carta, Cortesías, Reporte de gasto de insumos, Lector de facturas, Trabajadores, Tickets, Notificaciones, Configuración.

### Componentes y hooks
- `components/bar/*` (scanner, RedemptionHistory, OpenBottleDialog, BlindShiftCountDialog).
- `components/dashboard/`: Inventory*, Replenishment*, OpenBottles*, Waste*, PasslineAudit*, ExternalConsumption*, ShiftCounts*, LiveInventory*, Reconciliation*, Comparison*, WeeklyCount*, BarReplenishment.
- `components/sales/HybridQRScannerPanel`, partes QR de `HybridPostSaleWizard`, `CourtesyRedeemDialog` (reemplazado por flujo cover sin QR).
- `components/PickupQRDialog`.
- Hooks: `useStockData`, `useRealtimeInventory`, `useOpenBottles`, `useStockAlertsLive`, `useCOGSData`, `useFinanceMTD` (revisar dependencias antes).
- `lib/qr.ts`, `lib/printing/qr-svg.ts` (solo si no quedan usos).
- `lib/excel-inventory-parser.ts`.
- `lib/purchase-financial-engine.ts` (CPP/COGS).
- `lib/reporting/inventory-snapshot-pdf.ts`.
- `pages/CourtesyQR.tsx`/`CourtesyQRSimple.tsx`: refactor a "Cortesía cover" sin QR.

### Edge functions y RPC
- `predict-consumption` (basado en stock).
- RPCs `auto_redeem_sale_token`, `redeem_pickup_token`, etc.: se **dejan en DB** sin uso (cero migración).

### Roles
- Rol `bar` se quita del UI y rutas. Tabla `worker_roles` intacta; registros existentes ignorados.

### DB
- **Cero migraciones de eliminación**. Tablas `stock_*`, `pickup_*`, `courtesy_qr`, `open_bottles`, `waste_requests`, etc. se conservan para auditoría histórica y rollback.
- El catálogo `products` (con `sku_base`), `cocktails`, `cocktail_ingredients`, `purchase_*`, `learning_product_mappings`, `sales`, `sale_items` quedan plenamente activos.

---

## 7. Sidebar final (Admin)

```text
Dashboard
Operación
  Jornadas
  Puntos de Venta
  Anulaciones
Catálogo
  Productos / Insumos      (con sku_base, sin campos físicos visibles)
  Carta / Recetas
Ventas
  Análisis
  Cortesías                (sin QR; cover físico)
  Reporte de gasto de insumos
Compras
  Lector de facturas + métricas
Gestión
  Trabajadores
  Tickets
Sistema
  Notificaciones
  Configuración
```

Gerencia: subset read-only.

---

## 8. Fases de implementación

| Fase | Alcance | Duración |
|---|---|---|
| **F1 — POS nuevo flujo de impresión** | Reescribir `ticket-print.ts` y `usePrintJob` para imprimir cover grande + comprobante. Sin QR. Testing en ambos POS. | 3–4 días |
| **F2 — Eliminar /bar + scanner + QR** | Borrar `pages/Bar.tsx`, `components/bar/*`, `HybridQRScannerPanel`, `PickupQRDialog`, `lib/qr.ts`, ruta `/bar`. | 2–3 días |
| **F3 — Cortesías sin QR + integración en reporte POS** ✅ | Refactor `CourtesyQR*` a flujo cover físico, autoredención al emitir, `CourtesyRedeemDialog` eliminado, bloque de canje en `Sales.tsx` retirado. | hecho |
| **F4 — Eliminar inventario (UI)** ✅ | Sidebar limpio (sin inventario, mermas, conteos). Admin.tsx solo dispatcha vistas POS/Catálogo/Compras/Ventas/Gestión. AdminOverview sin LiveInventoryQuickCard / StockAlertsPanel / PendingShiftCountsBanner / EmergencyRequestsBanner. | hecho |
| **F5 — Reporte de gasto de insumos** ✅ | `IngredientUsageReportButton` reemplaza `RedeemReportButton`. PDF basado en `sale_items × cocktail_ingredients` + cortesías redimidas. | hecho |
| **F6 — Eliminar EERR + simplificar dashboard** ✅ | Borrados `IncomeStatement`, `FinancePanel`, `IncomeDeclarationPanel`, `JornadaCloseSummaryDialog`, `COGSBreakdownPanel`, `useFinanceMTD`. Ruta `/admin/reports/estado-resultados` retirada, menú "Estado de Resultados" eliminado del download menu y del ReportsPanel. `useCOGSData` se conserva para Analytics/JornadaKPI hasta refactor mayor. | hecho |
| **F7 — Lector de facturas protagónico** ✅ | `InvoiceAnalytics` con 4 vistas: Compras semanales (ISO), Histórico de precio por insumo, Venta vs Compra teórica, Top insumos por gasto y por variación. Tab "Análisis" como default en ComprasPanel. | hecho |
| **F8 — Limpieza final** ✅ | Rol `bar` quitado del UI (CreateWorkerDialog ROLES, filtro WorkersManagementNew, allowedRoles de `/sales`). Documents/`/admin/documents` se conserva (gestiona reintentos de documentos tributarios). DB intacta. | hecho |
| **Total** | | **~3 semanas de trabajo enfocado** |

---

## 9. Riesgos y consideraciones

1. **Cero migraciones DB**. Datos históricos (pickup_tokens, stock_movements, etc.) se conservan; las edge functions de redención quedan inactivas.
2. **Recetas son ahora la fuente única del consumo teórico**. Productos vendibles sin receta consumen directamente su propio `sku_base`. Faltantes de receta = subestimación de consumo.
3. **Cortesía sin QR**: cualquiera con el papel puede consumir. Decisión operativa aceptada.
4. **Cierre de jornada**: hoy depende de COGS para `financial_summary`. Al eliminar EERR/COGS, el cierre queda con caja, ventas y consumo teórico de insumos (sin margen ni resultado operacional).
5. **Trabajadores con rol `bar`**: deben reasignarse manualmente; UI deja de mostrar la opción, pero la DB no se toca.
6. **Catálogo-first se vuelve crítico**: cualquier insumo nuevo debe crearse antes de que el lector de facturas pueda matchearlo. El flujo de PendingCatalog se simplifica pero se mantiene.

---

## 10. Lo que se conserva intacto

- Auth (RUT + PIN), `create-worker-user`, login flow.
- Jornadas (apertura, cierre, caja, vendedores, ajustes, financial_summary simplificado).
- POS Alcohol + POS Tickets (motor de venta, sale_items, sales, payments, addons, voids).
- **Catálogo de insumos (`products` con `sku_base`)** + **Carta (`cocktails`, `cocktail_ingredients`, `cocktail_addons`)**.
- Lector de facturas (`extract-invoice`, `parse-invoice`, `learning_product_mappings`, `supplier_sku`).
- Cortesías (rediseñadas sin QR, integradas en reporte POS).
- Comisión STOCKIA 2.5%.
- Notificaciones transaccionales.
- Tickets cover multi-opción (impresión física, no QR).
- PWA Android, branding, single-venue Berlín.

---

## 11. Confirmación esperada

Ejecuto en orden **F1 → F8**, validando al final de cada fase. ¿Procedo?
