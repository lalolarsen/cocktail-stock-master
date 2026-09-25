# Guardarropía: un solo comprobante para el trabajador

## Qué cambia
- Cada cobro imprime **un solo comprobante**: la copia de control del trabajador. Ya no sale copia para el cliente, porque el cliente recibe la ficha física de custodia.
- El comprobante muestra: número de guardarropía, tipo (mochila/bolso o prenda) y cantidad, monto y medio de pago, jornada, fecha y hora de Chile, y el título "CONTROL TRABAJADOR".
- El papel se corta al final (manual o automático, igual que hoy), pero ya no hay línea de corte entre dos copias.
- El texto de ayuda de la pantalla cambia de "Salen dos copias…" a "Sale un comprobante de control para el trabajador".

## Qué no cambia
- Precios, cobro, numeración, impresión directa en la tablet (sin vista previa) y los reportes de cierre.

## Detalles técnicos
- `src/lib/printing/coatcheck-ticket.ts`: se genera una sola pieza de tipo "TRABAJADOR" (con monto y pago), tanto en la impresión de la tablet como en la del navegador; se quita la copia "CLIENTE".
- `src/pages/Guardarropia.tsx`: se actualiza el texto de ayuda.
- Sin cambios en la base de datos.
