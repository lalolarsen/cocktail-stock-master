# Lector de facturas simple + mejora visual global

## Qué cambia para las personas

**Quien sube la factura (una sola pantalla)**
1. Botón grande "Subir factura": abre la cámara del teléfono o el carrete de fotos.
2. La app lee la imagen sola. Muestra tres datos grandes para confirmar: proveedor, total y cuántos productos se leyeron.
3. Si algo está mal, puede corregir proveedor y total escribiendo. Nada más.
4. Botón "Listo". Mensaje de confirmación grande y vuelve al inicio.

Se eliminan de esa ruta todos los pasos actuales: revisión línea por línea, impuestos, fletes, bodega, checklists y confirmación contable.

**El gerente (panel de compras)**
- Historial de facturas: fecha, proveedor, total, cantidad de productos, y la foto original al abrirla.
- Al abrir una factura: lista simple de cantidad, producto, valor unitario y valor total.
- Historial de precios por producto: cuánto costó cada vez y variación respecto a la compra anterior.
- Bandeja "Por vincular": productos leídos que aún no están asociados a un producto del catálogo; el gerente elige el producto y queda aprendido para las próximas facturas.

**Inventario**: las facturas ya no suman stock. Son solo registro de compras y precios.

## Mejora visual (toda la app)

Pasada general manteniendo la identidad actual (fondo negro, verde de marca):
- Botones y campos con tamaños táctiles cómodos, jerarquía clara (acción principal siempre destacada).
- Tarjetas y tablas con espaciados consistentes, encabezados legibles y filas más altas.
- Estados vacíos y de carga uniformes en todos los módulos.
- Diálogos, pestañas y menú lateral alineados al mismo estilo.
- Revisión en pantalla de tablet y teléfono en los módulos que usa el personal (venta, barra, facturas).

## Detalle técnico

**Extracción** (`supabase/functions/extract-invoice/index.ts`)
- Reducir el prompt y el esquema de salida a: `supplier_name`, `supplier_rut`, `document_number`, `document_date`, `total_amount`, y por línea `qty`, `raw_product_name`, `unit_price`, `line_total`.
- Quitar del flujo: clasificación de impuestos específicos (IABA/ILA), multiplicadores de pack, cálculo de descuentos encadenados, detección de mixers/RedBull, `cost_unit_net` y `units_real`.
- Conservar el filtro de fletes/servicios y el auto-match por `(supplier_rut, supplier_sku)` + memoria `learning_product_mappings`, ya que el gerente sí quiere vinculación al catálogo.
- Guardar en `purchase_import_lines` solo los campos usados; los demás quedan nulos (sin cambios de esquema).

**Estado de la importación**
- Nuevo flujo de estados: `UPLOADED` → `EXTRACTED` → `SAVED`. Se retiran `RECONCILING`, `READY_TO_CONFIRM` y la confirmación contable con impacto en inventario.
- No se ejecuta `confirm_purchase_intake` ni se escriben `stock_lots` / `stock_movements`.

**Frontend**
- Nueva pantalla simple de captura (reemplaza `UploadInvoiceDialog` en el rol de subida): input `capture="environment"`, subida directa al bucket `purchase-invoices`, espera de extracción con indicador, tarjeta de confirmación de 3 datos.
- Reescribir `src/pages/ProveedoresImportDetail.tsx` (1033 líneas) como vista de solo lectura: cabecera, imagen de la factura y tabla de líneas; acción única "Vincular producto" por línea sin vincular.
- `ProveedoresPanel.tsx`: historial con la foto, sin pestañas de configuración de aprendizaje separadas (se integra la bandeja "Por vincular").
- `InvoiceAnalytics.tsx`: mantener resumen y comparativas; asegurar que el historial de precios por producto se alimente del catálogo vinculado.
- Retirar del módulo los componentes ya sin uso: `PreConfirmChecklist`, `StabilizedChecklist`, `UoMConversionDialog`, `DiagnosticPanel`, `MinimalReviewTable`, `LineDetailDrawer`, `ImportSummaryPanel`, y `src/lib/purchase-financial-engine.ts` si no queda referenciado. Se verifica cada import antes de borrar.
- Ruta `/admin/purchases-import` (`PurchasesImport.tsx`) queda redundante: se revisa y se elimina o se redirige.

**Base de datos**: sin migraciones destructivas. Las tablas `purchase_imports`, `purchase_import_lines`, `purchases` y `learning_product_mappings` se conservan tal cual; solo cambia qué columnas se llenan.

**Visual**: ajustes en `src/index.css` (tokens de espaciado/tamaño) y en las variantes de los componentes base (`button`, `card`, `input`, `table`, `tabs`, `dialog`, `badge`), sin colores fijos en pantallas.

## Orden de trabajo
1. Simplificar la extracción y validar con una factura real.
2. Pantalla de captura simple + confirmación de 3 datos.
3. Vista de factura de solo lectura y bandeja "Por vincular".
4. Historial de precios en el panel del gerente.
5. Limpieza de componentes sin uso.
6. Pasada visual global y revisión en tablet/teléfono.
