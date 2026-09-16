# Arreglar la impresión en las tablets

Hoy hay dos problemas distintos y se están mezclando:

1. **La app imprime "a ciegas".** Los tickets se mandan a imprimir desde una ventana oculta (y en cortesías/guardarropía desde una ventana emergente que Android bloquea). En las tablets eso se traduce en una vista previa que queda cargando para siempre y sin opción de guardar como PDF.
2. **Android no ve la impresora.** El diálogo de impresión de Android solo lista impresoras que tengan un "servicio de impresión" instalado. Una térmica Bluetooth emparejada, por sí sola, no aparece ahí. Esto no se arregla desde la app: se arregla en la tablet.

El plan ataca las dos cosas.

## 1. Vista de impresión visible (dentro de la app)

Reemplazar la impresión oculta por una pantalla de impresión real:

- Al cobrar / emitir, el ticket se dibuja **en pantalla completa dentro de la app**, tal como va a salir en papel (58 mm u 80 mm).
- Botones grandes debajo: **Imprimir**, **Compartir / Guardar PDF**, **Cerrar**.
- "Imprimir" abre el diálogo de Android sobre un documento ya cargado, así la vista previa nunca queda en blanco y "Guardar como PDF" funciona.
- "Compartir / Guardar PDF" genera el archivo desde la app y lo entrega al menú de compartir de Android (útil si la impresora falla y hay que reimprimir después).
- Nada de ventanas emergentes: se elimina el `window.open` de cortesías y guardarropía, que es la causa directa de que en la tablet no pase nada.
- Opción "Imprimir automáticamente" por tablet: si está activa, la pantalla se abre y lanza el diálogo sola; si no, espera el toque. Por defecto activada en cajas y desactivada mientras se prueba.

Esto aplica igual a: covers de venta del POS, cortesías, tickets dobles de guardarropía y ticket de prueba.

## 2. Ticket de prueba y diagnóstico en la tablet

En Configuración, dejar una tarjeta de impresión clara con:

- Selector 58 / 80 mm (ya existe, se mantiene por tablet).
- **Imprimir ticket de prueba** usando el mismo camino que una venta real.
- Un aviso en pantalla si Android no reporta ninguna impresora disponible, con el paso a seguir.

## 3. Lo que hay que hacer en cada tablet (fuera de la app)

Orden de prueba, de lo más probable a lo menos:

1. Instalar un **servicio de impresión** que hable con impresoras térmicas Bluetooth (por ejemplo RawBT, gratis en Play Store, o el complemento oficial del fabricante de la impresora). Sin esto, Android nunca va a listar la impresora.
2. Emparejar la impresora en Ajustes > Bluetooth y luego habilitarla dentro de ese servicio de impresión.
3. Abrir la app instalada en pantalla completa e imprimir el ticket de prueba.
4. Ajustar ancho (58 u 80 mm) según cómo salga el papel.

Necesito saber la **marca y modelo exacto de las impresoras** para decirte cuál servicio instalar; con eso confirmo si sirve RawBT o el complemento del fabricante. En las cajas existentes ya hay una RONGTA 80 mm configurada, así que si las nuevas son de la misma familia el camino está probado.

## Detalles técnicos

- Nuevo componente `PrintPreviewSheet` + contexto `PrintProvider`: recibe `{ html, css, paperWidth, autoPrint }`, monta el documento en un contenedor visible con `@media print { body > *:not(.print-root) { display:none } }` y llama `window.print()` sobre la ventana principal (no iframe, no popup) — el camino más confiable en Chrome Android.
- `src/lib/printing/qz.ts`: `printOneDocument` deja de crear iframes ocultos y delega al provider; se conservan `buildCoverHtml`, `buildCashierReceiptHtml` y los CSS. `printSaleDocuments` encola cover y comprobante como dos pasos en la misma hoja (secuencial, con confirmación entre ambos) en vez de dos `print()` encadenados, que Chrome descarta.
- `printCourtesyCover` y `printCoatcheckTicket` pasan de `window.open` a devolver `{ html, css }` y se imprimen por el provider; se mantiene la doble copia CLIENTE/PRENDA en una sola hoja.
- PDF/compartir: `html2canvas` + `jsPDF` a 58/80 mm, `navigator.share` con fallback a descarga.
- `warmupPrintJs` y la dependencia `print-js` quedan sin uso; se retiran junto con los stubs de `src/lib/qz-tray.ts` que ya nadie necesita.
- `print_jobs` sigue registrando cada intento con `print_status` y `error_message`; el resultado ahora viene del `afterprint` real de la ventana, no de un timeout de 8 s.
