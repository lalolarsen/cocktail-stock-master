# Optimización de rendimiento, UI de disco, catálogo y Guía rápida

## 1. Diagnóstico y optimización de rendimiento (POS en tablets)

Lo que encontré al revisar el código:
- `src/App.tsx` importa las 20+ páginas de forma estática (el comentario dice "lazy load" pero no lo son). Cada tablet descarga admin, reportes, compras, Excel, PDFs y gráficos antes de abrir el POS.
- `src/pages/Sales.tsx` (1.207 líneas) y `src/pages/Tickets.tsx` (1.059) se re-renderizan completos ante cualquier cambio de carrito.
- `ProductsList` recalcula agrupaciones sobre 200+ productos en cada tecla escrita.

Acciones:
- Convertir todas las rutas a carga diferida con `React.lazy` + `Suspense`, dejando POS (Sales/Tickets) y Auth en el bundle inicial y difiriendo admin, reportes, compras, developer y monitoring.
- Aislar el grid de productos y el carrito con `React.memo` y handlers estables (`useCallback`) para que tocar un producto no re-renderice toda la pantalla.
- Aplicar debounce (~200 ms) a las búsquedas del POS y del catálogo.
- Medir antes/después con una corrida de navegador: tiempo hasta interactivo del POS, peso del bundle inicial y tiempo de respuesta al agregar un producto al carrito. Se reporta la comparación.

## 2. Diseño para uso en disco (alto contraste, toque grande)

- Escala tipográfica del POS: nombres de producto y precios más grandes, números tabulares en totales.
- Altura mínima de toque de 56 px en botones de producto, cantidad, método de pago y confirmar.
- Contraste alto: sin texto en gris tenue sobre superficies oscuras; estados usan tokens semánticos (`success`, `warning`, `destructive`) ya definidos en el sistema Carbon Pro.
- Mensajes de estado claros y persistentes durante la venta: "Cobrando…", "Imprimiendo…", "Venta lista", "Error: reintentar", con bloqueo del botón para evitar dobles toques.

## 3. Catálogo más simple

En la pestaña Productos del Catálogo:
- Quitar el filtro de tres botones Todos / Volumétrico / Unitario (poco usado) y dejar un único selector compacto de tipo.
- Búsqueda rápida destacada arriba, con foco automático, limpieza en un toque y coincidencia por nombre y código.
- Ordenamiento seleccionable: por disponibilidad (stock de mayor a menor, agotados al final) o por tipo de producto (botella / unitario), además del orden alfabético actual.
- Contador de resultados y estado vacío útil cuando la búsqueda no encuentra nada.

## 4. Panel "Guía rápida" en el admin

Nueva vista dentro del admin (grupo Avanzado del menú) con tres guías en pasos numerados:
- **Vender**: abrir jornada, seleccionar productos, cobrar y entregar el ticket impreso al cliente. Al vender ya se descuentan los insumos de la preparación; no hay paso de QR.
- **Cerrar jornada**: conteo de caja, observación, cierre y correo de resumen.
- **Actualizar stock desde Excel**: descargar plantilla, completar por `sku_base`, subir, validar y confirmar.

Cada paso con texto corto, íconos y tipografía grande, pensado para leerse en tablet.

Nota transversal: la app ya no depende de QR ni de canje en barra. El consumo se descuenta al momento de la venta según la receta del producto (`sale_items` × `cocktail_ingredients`). En la revisión de textos del POS, los mensajes de estado y la Guía rápida se elimina cualquier referencia a "canjear QR" o "retiro en barra" y se reemplaza por el flujo de ticket entregado.


## 5. Auditoría de descuento de insumos e informe semanal

Nuevo panel de "Consumo de insumos" (dentro de Reportes) construido sobre el consumo teórico ya definido: `sale_items.qty × cocktail_ingredients.cantidad`, más cortesías.

- **Detalle por insumo**: cantidad vendida/descontada (ml o unidades), costo asociado, y en qué productos de carta se consumió — expandible para ver el desglose por receta.
- **Trazabilidad de cada descuento**: por jornada, POS y vendedor, para poder auditar de dónde viene cada consumo.
- **Comparación semanal**: semana actual vs semana anterior por insumo, con variación en cantidad y en % , y ranking de mayores subidas y bajas. Semanas calculadas en `America/Santiago`.
- **Alertas de inconsistencia**: productos vendidos sin receta cargada y recetas con insumos inexistentes o de costo cero, listados para corregir en el Catálogo.
- **Exportación** del detalle y de la comparación semanal a Excel/CSV.

## Detalles técnicos

- Archivos: `src/App.tsx` (lazy routes), `src/pages/Sales.tsx`, `src/pages/Tickets.tsx`, `src/components/sales/CategoryProductGrid.tsx`, `src/components/sales/PaymentPanel.tsx`, `src/components/dashboard/ProductsList.tsx`, `src/components/AppSidebar.tsx`, `src/pages/Admin.tsx`, nuevos `src/components/dashboard/QuickGuidePanel.tsx` y `src/components/dashboard/IngredientConsumptionPanel.tsx` (+ hook de consumo semanal), ajustes de tokens/utilidades en `src/index.css`.
- Los informes se calculan por consulta de lectura sobre `sales`, `sale_items`, `cocktail_ingredients` y `products`, usando `fetchAllRows` para superar el límite de 1000 filas y `Math.round()` en montos CLP.
- Sin migraciones de base de datos, sin cambios de RLS, ni en la lógica de ventas, jornadas o correos.
- Rutas y permisos por rol se mantienen iguales.

## Orden de ejecución

1. Medición inicial y carga diferida de rutas.
2. Memoización y debounce en POS; medición final comparativa.
3. Ajustes visuales de disco (tipografía, toque, estados).
4. Simplificación del catálogo con búsqueda y ordenamiento.
5. Panel de auditoría de insumos y comparación semanal.
6. Panel Guía rápida.

