# Valor de cortesías en el reporte

## Qué cambia en el PDF de Cortesías
- Nueva tarjeta de resumen arriba: **Valor total entregado** (en CLP).
- Tabla "Por motivo": se agrega la columna **Valor** con la suma de cada motivo y el total al pie.
- Tabla "Por socio": se agrega la columna **Valor**.
- Tabla "Detalle": se agregan **Precio unit.** y **Valor** (precio × cantidad) por cada cortesía.

## De dónde sale el valor
- Se usa el precio de venta actual del producto en la carta (el mismo que se cobra en el POS).
- Si un producto ya no existe o no tiene precio, se muestra "—" y cuenta como $0 en las sumas.

## Detalles técnicos
- `src/lib/reporting/courtesy-jornada-pdf.ts`: consultar `cocktails(id, price)` con los `product_id` de `courtesy_qr`; calcular `value = Math.round(price × qty)`; acumular por motivo y socio; montos con `formatCLP`, columnas alineadas a la derecha.
- Sin cambios en base de datos.
