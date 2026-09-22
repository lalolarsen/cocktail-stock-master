# Lector de facturas más claro + Guardarropía como caja

## 1. Lector de facturas

**Navegación y foto**
- Botón "Volver" visible arriba en la pantalla de la factura y en el detalle, siempre en el mismo lugar.
- La foto de la factura deja de ser un enlace que se abre en otra app. Al tocarla se agranda dentro de la misma pantalla, con zoom y un botón "Cerrar". Aparte queda un botón explícito "Descargar" para quien quiera el archivo.
- El diálogo de subir factura gana un botón "Cancelar" en el paso de elegir foto y en el de confirmar.

**Corregir vinculaciones equivocadas**
- En el detalle de la factura, cada línea ya vinculada muestra el nombre del insumo con un botón "Cambiar".
- "Cambiar" abre el buscador de catálogo y permite elegir el insumo correcto, o quitar la vinculación y dejar la línea pendiente.
- Al corregir se olvida la vinculación equivocada aprendida (proveedor + texto de la factura) y se guarda la nueva, así la próxima factura llega bien. No se toca el historial anterior.
- La bandeja "Por vincular" gana el mismo botón "Cambiar" y un contador claro.

**Interfaz**
- Historial: filas más altas, proveedor destacado, total alineado, estado con etiqueta legible ("Todo vinculado" / "N por vincular") y buscador por proveedor o folio.
- Detalle: cabecera compacta con proveedor, fecha, folio y total; tabla con cantidad, producto, valor unitario, total y el insumo del catálogo.
- En teléfono y tablet la tabla pasa a tarjetas apiladas, sin desplazamiento horizontal.

## 2. Guardarropía

**Dos precios fijos**
- Mochila / bolso: $2.000
- Prenda de ropa: $1.000
- La pantalla muestra dos bloques grandes, cada uno con − / + y su total.
- Un ticket por tipo: si alguien deja una mochila y una chaqueta, salen dos números distintos.
- Los precios se editan en Config (Avanzado), no en la tablet.

**Ahora es una caja más**
- Se quita "Tablet Guardarropía" del menú lateral del panel de administración.
- En "Barras y POS" se agrega un tipo de caja nuevo: "Guardarropía · Caja". Se crea igual que las demás, con impresora asignada.
- El vendedor entra con su RUT y PIN, elige la caja de guardarropía en la lista de cajas y entra directo a la pantalla de guarda.
- Sus montos siguen entrando al cierre de jornada con su desglose efectivo/tarjeta, como hoy.

**Configuración en Avanzado**
- Nueva tarjeta "Guardarropía" junto a la de entradas: precio de mochila, precio de prenda y nada más.

## Detalle técnico

**Facturas**
- `ProveedoresImportDetail.tsx`: `<ArrowLeft>` fijo en cabecera; visor de imagen con `Dialog` en vez de `<a target="_blank">`; `ProductPicker` habilitado también para líneas con `product_id` (modo "Cambiar"), y acción "Quitar vinculación" que pone `product_id = null`, `status = 'REVIEW'` y recalcula `issues_count`.
- Al cambiar de insumo: `DELETE` de la fila equivocada en `learning_product_mappings` (match por `supplier_rut` + `raw_text`, o `supplier_sku` cuando existe) y `INSERT` de la nueva. Sin `UPDATE` masivo de líneas históricas.
- `ProveedoresPanel.tsx`: buscador local, etiquetas de estado, filas táctiles, `PendingLinksTab` con el mismo control de cambio.
- `InvoiceCaptureDialog.tsx`: botones "Cancelar"/"Volver" en pasos `pick` y `confirm`.

**Guardarropía**
- Migración: en `coatcheck_settings` agregar `price_backpack integer` y `price_garment integer` (nullable, con backfill desde `price_per_garment`); `price_per_garment` se marca como DEPRECATED y se conserva. En `coatcheck_tickets` agregar `item_type text` ('backpack' | 'garment'), nullable.
- `issue_coatcheck_ticket`: nueva versión que recibe `_item_type` y emite un ticket por tipo, manteniendo el correlativo por jornada.
- `pos_terminals.pos_type` acepta `coatcheck`; `POSBarsManagement.tsx` suma la opción con su etiqueta y descripción, y el chip de filtro.
- Selección de caja: la pantalla de guardarropía (`/guardarropia`) pasa a cargar terminales con `pos_type = 'coatcheck'` igual que hace `Sales.tsx`, con acceso para `vendedor`, `admin` y `gerencia` en `ProtectedRoute`.
- `AppSidebar.tsx`: se elimina la sección "Tablets" para guardarropía (Cortesías se mantiene, es rol admin).
- Nueva tarjeta de config en la vista Config del panel admin, junto a `ReceiptSettingsCard`.
- Impresión: `coatcheck-ticket.ts` imprime el tipo de ítem en el ticket y sigue usando RawBT.
- Cierre de jornada: el resumen suma ambos tipos; se añade el desglose por tipo en el correo.

## Orden de trabajo
1. Facturas: volver, visor de imagen, recambio de vinculación.
2. Facturas: pasada visual del historial y el detalle.
3. Guardarropía: precios dobles en base de datos y función de emisión.
4. Guardarropía como tipo de caja + selección de terminal + salida del menú.
5. Tarjeta de configuración en Avanzado y ajuste del cierre de jornada.
