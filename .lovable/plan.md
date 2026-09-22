# Guardarropía: separar la copia del cliente y la de la prenda

Hoy las dos copias salen una pegada a la otra en el mismo trozo de papel, sin espacio para cortarlas. La impresora no tiene guillotina, así que el papel se corta a mano.

## Qué cambia

- Primero sale la **copia CLIENTE** completa, con espacio en blanco al final y una línea de corte marcada (tijera y línea de guiones) para cortar cómodamente.
- Después sale la **copia PRENDA**, también con espacio y línea de corte al final.
- Se mantiene el mismo número grande, el tipo de ítem (mochila/bolso o prenda), el monto en la copia del cliente, la jornada y los avisos "Conserve este ticket" / "Pinchar en la prenda".
- Se envía una sola orden de impresión, igual de rápida que ahora, sin vista previa.
- Se añade también la orden de corte automático al final de cada copia: si en el futuro se usa una impresora con guillotina, cortará sola sin cambiar nada más.
- La vista de respaldo en computador (navegador) mantiene el mismo aspecto con su línea de corte entre copias.

## Detalle técnico

Archivo: `src/lib/printing/coatcheck-ticket.ts`

- En `buildRawBtPayload`, cerrar cada copia con avance de papel (`ESC d n`, ~4 líneas), una fila de separación visible (`- - - - ✂ - - - -` en ASCII) y `GS V 66 0`, en lugar de un único corte al final del segundo ticket.
- Quitar el separador de guiones simple que hoy une ambas copias.
- Mantener un solo `window.location.assign("intent:base64,...rawbt...")` con todo el payload.
- En `printWithBrowser`, ajustar el CSS para que cada `.copy` termine con margen y línea de corte discontinua.

Sin cambios de base de datos ni de otros comprobantes.
