# Plan: Módulo de Compras (facturas + métricas) y limpieza de Inventario en vivo

## Objetivo
1. Crear un módulo **Compras** donde se suben facturas (PDF/imagen), se reconocen automáticamente (proveedor, folio, fecha, total) y se muestran 3 métricas clave.
2. Ocultar de la UI todos los módulos de inventario en vivo / reposición / conteos / comparaciones. **No se borran datos** — solo se ocultan del sidebar y rutas. Mermas, cortesías y reporte de canjes se conservan.

## Parte 1 — Módulo "Compras"

### Aprovechar lo existente
Ya existe infraestructura de facturas que actualmente vive bajo "Proveedores":
- Tabla `purchase_imports` (header con `supplier_name`, `document_number`, `document_date`, `total_amount`, etc.)
- Tabla `purchase_import_lines` (líneas con producto, unidades, costo unitario)
- Edge function `extract-invoice` (OCR/extracción)
- `UploadInvoiceDialog`, `ProveedoresPanel`, `ProveedoresImportDetail`

**Decisión:** renombrar la vista "Proveedores" → **"Compras"** y agregar arriba un tab de **Métricas**. Así no se duplica nada y el flujo de subir factura ya está probado.

### Estructura del nuevo panel
`CompasPanel` con 2 tabs:

1. **Métricas** (nuevo) — selector de mes (default: mes actual, en `America/Santiago`):
   - **KPI cards (fila superior):**
     - Total comprado del mes (suma de `total_amount` de imports `CONFIRMED`).
     - Total vendido del mes (suma de `sales.total` de ese mes, excluyendo cortesías).
     - **Ratio Compras/Ventas** (%) — referencia rápida de salud.
   - **Gráfico de línea:** comprado vs vendido por día del mes.
   - **Top productos comprados (tabla):** producto, unidades totales compradas, monto total, último costo unitario. Top 20. Basado en `purchase_import_lines` de imports `CONFIRMED` del mes.
   - **Evolución del costo unitario por producto:** buscador de producto → gráfico de línea con `cost_unit_net` de cada compra confirmada en los últimos 6 meses (detecta alzas).

2. **Facturas** — listado actual de `ProveedoresPanel` (subir, ver estado, abrir detalle). Se mantiene tal cual.

### Reconocimiento automático
La factura ya extrae: proveedor, RUT, folio, fecha, neto, IVA, **total**, líneas con producto/unidades/costo. No requiere cambios. El usuario solo necesita revisar y confirmar (flujo existente `ProveedoresImportDetail`).

### Detalles técnicos
- Nuevo archivo: `src/components/dashboard/ComprasPanel.tsx` (wrapper con tabs).
- Nuevo archivo: `src/components/dashboard/compras/PurchaseMetrics.tsx` (las métricas).
- Hook nuevo: `src/hooks/useComprasMetrics.ts` con queries paginadas (`fetchAllRows`) por `venue_id`, filtradas por mes.
- Ventas del mes: leer de `sales` (excluyendo `is_courtesy=true`) sumando `total`.
- Compras del mes: `purchase_imports` filtrado por `status='CONFIRMED'` y `document_date` dentro del mes.
- Gráficos con `recharts` (ya está en el proyecto).
- Sidebar: agregar item **"Compras"** (icono `Receipt`/`FileText`) en sección "Ventas" o nueva sección "Finanzas". Eliminar la entrada antigua "Proveedores" para no duplicar.

## Parte 2 — Ocultar Inventario en vivo (solo UI)

### Items a quitar del sidebar (admin + gerencia)
De `src/components/AppSidebar.tsx`:
- `live-inventory` (Inventario en vivo)
- `replenishment` (Reposición)
- `weekly-count` (Conteo semanal)
- `shift-counts` (Conteos por aprobar)
- `botellas` (Botellas abiertas)
- `comparison` (Comparación de inventario)
- `reconciliation` (Cuadre de inventario)
- `external-consumption` (Consumo externo)
- `inventory` (Hub de inventario)
- `passline-audit`

### Qué SÍ se mantiene visible
- **Reporte de canjes** (oro) — intacto, en Reportes.
- **Mermas con aprobación** (`waste`) — intacto en el sidebar.
- **Cortesías QR** y su reporte por jornada — intactos.
- **Productos** (catálogo) — se conserva, ya que sigue siendo necesario para POS/recetas.

### Cambios concretos
- Editar `AppSidebar.tsx`: quitar items listados arriba de ambos arrays (`ADMIN_SECTIONS`, `GERENCIA_SECTIONS`). La sección "Inventario" queda solo con "Productos".
- Editar `Admin.tsx`: dejar los `case` y renders existentes en su lugar (no se rompe nada por URL directa), pero remover del `allowedViewsForGerencia` los valores ocultados para que gerencia no acceda.
- **No tocar** la base de datos ni edge functions. **No tocar** la lógica de stock que ocurre en canjes (sigue escribiendo `stock_movements` por consistencia histórica, aunque ya no se muestre).

## Archivos a tocar
- **Nuevos:**
  - `src/components/dashboard/ComprasPanel.tsx`
  - `src/components/dashboard/compras/PurchaseMetrics.tsx`
  - `src/hooks/useComprasMetrics.ts`
- **Editados:**
  - `src/components/AppSidebar.tsx` (agregar Compras, quitar items de inventario y "Proveedores")
  - `src/pages/Admin.tsx` (montar `<ComprasPanel/>` en `proveedores` o nuevo `compras`, recortar `allowedViewsForGerencia`)

## Fuera de alcance
- Cruce compras ↔ canjes para margen por producto (lo descartaste por ahora).
- Drop de tablas o cambios de schema.
- Cambios en POS, Bar, Jornadas, Cortesías, Mermas.
- Cambios al flujo de extracción OCR de facturas (ya funciona).
