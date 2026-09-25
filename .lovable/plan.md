# Entradas: solo cover + reportes de cierre completos

## 1. Impresión de entradas (tablet y PC)
- Al vender entradas **no se imprime comprobante ni pieza de entrada**.
- Solo sale un cover por cada cover incluido. Si ese tipo de entrada no trae cover, no se imprime nada.
- En tablet (RawBT) los covers salen directo, sin vista previa, igual que Guardarropía: un solo envío, con espacio y una línea para cortar a mano entre covers.
- En PC se imprimen solo los covers con el navegador.
- **Sin reimpresión de covers**: se quita el botón "Reimprimir" en Recientes para ventas de entradas.
- **Respaldo para que nunca se quede sin imprimir**:
  - La venta queda marcada como "cover pendiente" hasta que la impresión se envía bien.
  - Si el envío a la impresora falla, aparece un aviso grande en pantalla con un botón "Imprimir cover pendiente", que solo funciona una vez por venta.
  - Al volver a la caja se revisan las ventas con cover pendiente y se muestran para imprimirlas.
  - Cada cover lleva su número único, así nunca pueden salir dos iguales válidos.
- **Cover más claro para evitar errores**:
  - Nombre de la jornada en letras grandes y en negrita, arriba del cover.
  - Franja destacada "VÁLIDO SOLO ESTA JORNADA" con la fecha de la noche.
  - Número de jornada y número de cover visibles, y el trago/opción del cover en grande.

## 2. Reportes de cierre mejorados
Aplica al correo de cierre y al PDF de cierre que se descarga en Jornadas. Secciones:
- **Resumen general**: total de la noche = Alcohol + Entradas + Guardarropía, con efectivo / tarjeta.
- **Por caja**: cada caja por separado (Alcohol, Entradas, Guardarropía, Caja remota), con cantidad de ventas, efectivo, tarjeta y total.
- **Entradas**: por tipo de entrada, cantidad y monto; covers entregados por opción.
- **Guardarropía**: mochilas y prendas por separado (cantidad y monto), efectivo/tarjeta, números de comprobante del primero al último.
- **Cortesías**: emitidas y canjeadas, por producto y por quién las emitió, con el costo teórico.
- **Consumo de insumos** (basado en ventas + cortesías), como hoy.
- **Arqueo de caja** y observaciones del cierre, como hoy.
- Diseño más limpio: títulos claros, montos destacados y secciones que se ocultan si no tuvieron movimiento.

## Detalles técnicos
- `src/lib/printing/ticket-print.ts`: `printTicketSale` imprime solo `coverTokens`; retorna sin hacer nada si está vacío. Nuevo payload ESC/POS para Android vía `intent:base64` (reutilizar `isAndroid` de `coatcheck-ticket.ts`), con feed + línea de corte + comando de corte por cover.
- `src/pages/Tickets.tsx`: `autoPrintSale` y `reprintSale` sin entradas sintéticas; reimpresión incluye covers.
- `supabase/functions/send-jornada-summary` + `jornada-closed-summary.tsx`: agregar desglose por caja incluyendo `coatcheck`, detalle mochila/prenda (`item_type`), rango de números, cortesías por producto/emisor/canjeadas, entradas por tipo y covers.
- `JornadaDownloadMenu.tsx` + `jornada-cashier-report.ts`: sumar Guardarropía (`coatcheck_tickets`), cajas por tipo y cortesías al PDF.
- Redeploy de la función de correo. Sin cambios en base de datos.
- Verificar con una jornada real: generar el PDF y previsualizar el correo.
