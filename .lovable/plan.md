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
- **Vender**: abrir jornada, seleccionar productos, cobrar, entregar QR.
- **Cerrar jornada**: conteo de caja, observación, cierre y correo de resumen.
- **Actualizar stock desde Excel**: descargar plantilla, completar por `sku_base`, subir, validar y confirmar.

Cada paso con texto corto, íconos y tipografía grande, pensado para leerse en tablet.

## Detalles técnicos

- Archivos: `src/App.tsx` (lazy routes), `src/pages/Sales.tsx`, `src/pages/Tickets.tsx`, `src/components/sales/CategoryProductGrid.tsx`, `src/components/sales/PaymentPanel.tsx`, `src/components/dashboard/ProductsList.tsx`, `src/components/AppSidebar.tsx`, `src/pages/Admin.tsx`, nuevo `src/components/dashboard/QuickGuidePanel.tsx`, ajustes de tokens/utilidades en `src/index.css`.
- Sin migraciones de base de datos, sin cambios de RLS, ni en la lógica de ventas, jornadas, stock teórico o correos.
- Rutas y permisos por rol se mantienen iguales.

## Orden de ejecución

1. Medición inicial y carga diferida de rutas.
2. Memoización y debounce en POS; medición final comparativa.
3. Ajustes visuales de disco (tipografía, toque, estados).
4. Simplificación del catálogo con búsqueda y ordenamiento.
5. Panel Guía rápida.
