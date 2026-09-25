# Entradas: imprimir solo lo necesario y rápido en tablet

## Qué cambia
- Por cada venta de entradas sale el comprobante y, **solo si la entrada incluye cover**, un cover por cada uno. Se dejan de imprimir las piezas de "entrada" sueltas. Aplica igual en tablet y en PC.
- En las tablets (Android con RawBT) la caja de entradas imprime directo, sin vista previa, igual que Guardarropía: todo sale en un solo envío, con espacio y una línea marcada para cortar a mano entre cada pieza.
- En PC se mantiene la impresión actual del navegador, pero solo con comprobante y covers.
- Reimprimir desde "Recientes" sigue el mismo criterio (comprobante + covers si los hay), también directo en tablet.

## Qué no cambia
- Ventas, covers en la base de datos, jornada impresa en cada cover ("Válido solo esta jornada").

## Detalles técnicos
- `src/lib/printing/ticket-print.ts`:
  - Nuevo `buildRawBtPayload(data)` ESC/POS: comprobante (ítems, total, pago, jornada) + cover grande por cada `coverTokens`, con avance de papel, línea de corte y comando de corte al final de cada pieza.
  - `printTicketSale`: si es Android, enviar `intent:base64,...;scheme=rawbt;...` y retornar; si no, flujo por iframe actual.
  - Dejar de agregar piezas de entrada (`entryTokens`) al imprimir.
- `src/pages/Tickets.tsx`: `autoPrintSale` y `reprintSale` dejan de construir entradas sintéticas; la reimpresión pasa a incluir covers.
- Reutilizar el helper `isAndroid` / codificación ya usados en `coatcheck-ticket.ts`.
- Sin cambios en base de datos.
