# Guardarropía: solo cobrar y generar número

## Qué cambia
- Se elimina la pestaña "Entregar" (retiro de prendas) y el buscador por número.
- Se elimina la tarjeta "Sin retirar" del resumen; quedan Recaudado, Efectivo y Tarjeta.
- La pantalla queda en un solo paso: tipo (mochila $2.000 / prenda $1.000), cantidad, pago y "Cobrar e imprimir".
- Siguen saliendo las dos copias con el mismo número: una para el cliente y otra para el cajero, con la línea de corte.
- Se ajusta el texto de ayuda: "Salen dos copias con el mismo número: cliente y cajero."
- La copia que decía "prenda" pasa a llamarse "copia cajero" en el comprobante.

## Qué no cambia
- Precios, numeración por tipo, cierre de jornada y totales recaudados.
- Los tickets antiguos quedan guardados tal cual; no se borra nada.

## Detalles técnicos
- `src/pages/Guardarropia.tsx`: quitar estado `tab`, `search`, `handleRetrieve`, `active/filteredActive` y la tarjeta pendiente; grid de KPIs a 3 columnas.
- `src/lib/printing/coatcheck-ticket.ts`: renombrar etiqueta de la segunda copia a "COPIA CAJERO" (RawBT y respaldo navegador).
- Sin cambios en base de datos.
