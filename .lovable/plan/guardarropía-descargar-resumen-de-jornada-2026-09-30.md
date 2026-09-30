# Guardarropía: descargar resumen de jornada

## Qué se agrega
- En la pantalla de Guardarropía se agrega un botón **"Descargar resultados de jornada"**, igual al que tienen hoy las cajas de Entradas y Alcohol.
- Sale el mismo formato de 80mm que ya usan esas cajas: "RESULTADOS JORNADA", el local, la caja, el número y la fecha de la jornada.
- El resumen trae:
  - efectivo (cantidad y monto), tarjeta (cantidad y monto) y el total con la cantidad de comprobantes;
  - detalle de **mochilas** y **prendas**, cada una con cantidad y monto;
  - números de comprobante, del primero al último.
- Al final lleva el mismo formulario de siempre: **firma del cajero, nombre y RUT (opcional)**, además de la hora en que se generó.
- No entran los comprobantes anulados.

## Detalles técnicos
- En `src/lib/reporting/jornada-cashier-report.ts`, `CashierReportData` recibe un campo opcional nuevo, `extraLines`: una lista de etiqueta y valor. Se imprime como una sección "DETALLE" antes de la firma. Entradas y Alcohol siguen iguales.
- `src/pages/Guardarropia.tsx`:
  - Se agrega un botón con el ícono de descarga en la cabecera.
  - El resumen se arma con los tickets de la jornada que la pantalla ya carga, filtrados con `status !== "cancelled"`.
  - `item_type` separa mochila de prenda.
  - Se busca `numero_jornada` y `fecha` en `jornadas`, y se llama a `downloadCashierReport`.
- No hay cambios en la base de datos.
