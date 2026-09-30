# Entradas: comprobante de entrada solo en PC

## Qué cambia
- **Venta desde PC**: se imprime un **comprobante de entrada para el cliente** por cada entrada vendida, y luego el cover que corresponda, si trae.
- **Venta desde tablet**: todo queda como ahora. Sale solo el cover, directo y sin vista previa. Si la entrada no trae cover, no se imprime nada.
- El comprobante de entrada es para el cliente, no para el vendedor. Lleva:
  - nombre del local;
  - "ENTRADA" en grande y el tipo de entrada;
  - el número, por ejemplo "Entrada 1 de 3";
  - la jornada con la franja "VÁLIDO SOLO ESTA JORNADA";
  - fecha y hora de Chile;
  - número de venta.
- No se reimprime y sigue igual el aviso de "pendiente de imprimir". En PC también cubre las entradas.

## Detalles técnicos
- `src/lib/printing/ticket-print.ts`: se agrega de nuevo `buildEntryHtml(data, piece, index, total)`. En `printTicketSale`, si no es Android, se imprimen primero los `entryTokens` y después los `coverTokens`. En Android se ignoran los `entryTokens`. `skipped` solo aplica cuando no hay nada que imprimir para ese dispositivo.
- `src/pages/Tickets.tsx`: `autoPrintSale` vuelve a armar `entryTokens`, una pieza por unidad según las líneas del carrito, solo cuando `!isAndroid()`. La cola de pendientes guarda las entradas y los covers.
- Se detecta el dispositivo con el `isAndroid()` que ya existe. No hay cambios en la base de datos.
