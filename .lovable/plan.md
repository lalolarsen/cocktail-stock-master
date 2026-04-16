

# Plan: Módulo de Comparación de Inventario

## Resumen

Crear un componente nuevo `InventoryComparisonModule` que unifica la lógica de `RedeemReconciliationPanel` (consumo teórico) con `StockReconciliation` (conteo real + aplicar ajustes) en un solo flujo completo por jornada y ubicación.

## Flujo del usuario

1. Selecciona **jornada** y **ubicación** (barra)
2. Presiona "Calcular" → el sistema carga:
   - Stock actual de `stock_balances` para esa ubicación
   - Consumo teórico de redeems (`pickup_redemptions_log.theoretical_consumption`)
   - Consumo teórico de cortesías (`courtesy_redemptions` + recetas)
   - Calcula **stock esperado** = stock actual − consumo teórico total
3. Tabla con columnas: **Producto | Stock actual | Consumo ventas | Consumo cortesías | Esperado | Conteo real | Diferencia | Estado**
4. El usuario ingresa conteo real por producto
5. Diferencias coloreadas: rojo = faltante, azul = sobrante, gris = calza
6. Botón **"Aplicar cuadre"** → actualiza `stock_balances` al valor real + inserta `stock_movements` tipo `reconciliation`
7. Botón **"Descargar reporte CSV"** con todas las columnas

## Cambios concretos

### 1. Nuevo componente: `src/components/dashboard/InventoryComparisonModule.tsx`

Componente completo que:
- Carga jornadas, ubicaciones, stock_balances, productos (con metadata: unit, capacity_ml, is_bottle)
- Calcula consumo teórico (misma lógica de `RedeemReconciliationPanel.loadReconciliation`)
- Fusiona con stock actual por producto para esa ubicación
- Inputs editables para conteo real (patrón de `StockReconciliation`)
- Display de botellas con formato `N bot. +X%` para volumétricos
- KPIs: canjes QR, cortesías, productos con diferencia, total faltante/sobrante
- Explicación visual del flujo (card informativa)
- Aplicar cuadre: inserta `stock_movements` + actualiza `stock_balances` + `products.current_stock`
- CSV con todas las columnas incluyendo diferencias y estado

### 2. Modificar `src/components/dashboard/InventoryHub.tsx`

- Reemplazar el botón "Canjes vs Stock" (`redeem_recon`) por "Comparación de inventario"
- Importar `InventoryComparisonModule` en vez de `RedeemReconciliationPanel`
- Opcionalmente eliminar el botón "Cuadre" (`reconciliation` / `StockReconciliation`) ya que queda subsumido

### 3. Sin cambios de DB

Todo usa tablas existentes: `stock_balances`, `stock_movements`, `pickup_redemptions_log`, `courtesy_redemptions`, `cocktail_ingredients`, `products`, `jornadas`, `stock_locations`.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/InventoryComparisonModule.tsx` | Nuevo — módulo completo |
| `src/components/dashboard/InventoryHub.tsx` | Reemplazar botón/lazy import redeem_recon → comparison; eliminar botón Cuadre |

## Riesgos

- **Bajo**: La lógica de aplicar cuadre es idéntica a `StockReconciliation.handleApply` ya probada.
- **Bajo**: El cálculo de consumo teórico reutiliza la lógica existente de `RedeemReconciliationPanel`.
- Los componentes anteriores (`StockReconciliation`, `RedeemReconciliationPanel`) quedan como archivos huérfanos pero sin impacto; se pueden eliminar después si se desea.

