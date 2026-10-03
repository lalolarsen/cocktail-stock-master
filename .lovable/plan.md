# Resumen de jornada directo a la impresora en tablets

## Qué pasa hoy
El botón "Resumen" de Guardarropía (y el de Entradas y Alcohol) siempre abre la vista previa del navegador. No pasa por RawBT, por eso en la tablet no imprime directo.

## Qué cambia
- **En tablet (Android):** el resumen va directo a la impresora por RawBT, sin vista previa, igual que los comprobantes de Guardarropía.
- **En PC:** sigue igual, con la ventana de impresión.
- El contenido no cambia: RESULTADOS JORNADA, local, caja, jornada y fecha; efectivo, tarjeta y total; detalle de mochilas y prendas, y rango de comprobantes; espacios para firma, nombre y RUT (opcional); hora en que se generó. Al final avanza el papel y corta.
- Como comparten el mismo botón, las cajas de Entradas y Alcohol también imprimirán directo cuando se usen desde una tablet.

## Detalles técnicos
- En `src/lib/reporting/jornada-cashier-report.ts` se agrega `buildRawBtPayload(data)` con ESC/POS (texto ASCII sin tildes, 32 columnas, filas de etiqueta y valor alineadas, negrita en títulos y total, líneas para firma, avance y corte). Se reutiliza el mismo patrón que `coatcheck-ticket.ts`.
- `downloadCashierReport` detecta Android (`/Android/i`). En ese caso envía `intent:base64,...;scheme=rawbt;package=ru.a402d.rawbtprinter` y no abre ventana. En los demás equipos usa el HTML actual.
- No hay cambios en la base de datos.
