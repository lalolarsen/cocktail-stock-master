

# Plan: Comparación de Inventario vía Excel + Sidebar + Mermas en Análisis

## Resumen

Transformar el módulo de Comparación de Inventario para que funcione con carga de Excel (plantilla que llena el bartender), agregar como ítem independiente en el sidebar, mostrar nombre de jornada en el selector, y mostrar resultado de mermas/diferencias en el módulo de Análisis.

## Flujo del usuario

1. Entra a **Comparación** desde el sidebar
2. Selecciona **jornada** (ve el nombre, ej: "Apertura Viernes") y **ubicación**
3. Descarga **plantilla Excel** (ya pre-llenada con productos de esa ubicación + stock teórico)
4. El bartender llena la columna `stock_real` en el Excel
5. Sube el Excel → el sistema lo parsea y muestra preview con las cantidades
6. Confirma el conteo → se habilita botón **"Comparar"**
7. Al comparar: calcula consumo teórico (redeems + cortesías), stock esperado, diferencias
8. Puede **aplicar cuadre** → actualiza inventario + registra movimientos
9. Las diferencias (mermas) aparecen en el módulo de **Análisis** como sección adicional

## Cambios concretos

### 1. Reescribir `InventoryComparisonModule.tsx`
- **Eliminar inputs manuales** de conteo real por producto
- **Agregar descarga de plantilla** Excel (reutilizar `generateConteoTemplate` de `excel-inventory-parser.ts`)
- **Agregar upload de Excel**: parsear con XLSX, extraer `sku_base` + `stock_real`, matchear con productos
- **Preview paso intermedio**: mostrar tabla con lo parseado del Excel para confirmar
- **Estado "confirmado"**: solo después de confirmar se habilita "Comparar"
- **Comparar**: calcular consumo teórico, esperado, diferencias vs conteo del Excel
- **Aplicar cuadre**: misma lógica actual (stock_movements + stock_balances update)
- **Selector de jornada muestra `nombre`** en vez de `#numero — fecha`

### 2. Agregar "Comparación" al sidebar (`AppSidebar.tsx`)
- Nuevo `ViewType`: `"comparison"` (ya existe en el tipo pero no está en el sidebar)
- Agregar ítem en la sección **Inventario** del sidebar admin: `{ title: "Comparación", value: "comparison", icon: Scale }`
- También agregar en `GERENCIA_SECTIONS`

### 3. Registrar vista en `Admin.tsx`
- Agregar `{activeView === "comparison" && <InventoryComparisonModule />}`
- Agregar case en `getViewTitle`: `"comparison"` → `"Comparación de Inventario"`
- Agregar `"comparison"` a `allowedViewsForGerencia`

### 4. Mostrar mermas/diferencias en `AnalyticsPanel.tsx`
- Nueva sección "Mermas por Comparación" que consulta `stock_movements` tipo `reconciliation` del mes seleccionado
- Agrupa por producto, muestra faltantes (negativos) con su costo estimado
- KPI adicional: "Merma total estimada" en CLP

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/InventoryComparisonModule.tsx` | Reescritura: flujo Excel upload + preview + confirmar + comparar |
| `src/components/AppSidebar.tsx` | Agregar "Comparación" en sección Inventario |
| `src/pages/Admin.tsx` | Registrar vista "comparison" |
| `src/components/dashboard/AnalyticsPanel.tsx` | Agregar sección de mermas desde stock_movements reconciliation |

## Sin cambios de DB
Todo usa tablas existentes: `stock_balances`, `stock_movements`, `products`, `jornadas`, `stock_locations`, `pickup_redemptions_log`, `courtesy_redemptions`.

