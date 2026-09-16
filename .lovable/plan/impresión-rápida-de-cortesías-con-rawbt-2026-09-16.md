# Impresión rápida de cortesías con RawBT

RawBT ya reconoce la impresora, así que el problema restante está en el camino de impresión de STOCKIA:

1. Cortesías usa una ventana emergente con `window.print()`.
2. Chrome intenta generar una vista previa completa antes de entregarla a RawBT.
3. Esa vista previa es innecesaria para una tablet dedicada y añade la espera que está fallando.

El objetivo será que **Emitir e imprimir** registre la cortesía y la envíe inmediatamente a RawBT, sin abrir la vista previa de Android.

## 1. Impresión directa de cortesías

Reemplazar `window.open()` + `window.print()` por una entrega directa a RawBT:

- Convertir el cover a un ticket térmico compacto de texto e instrucciones ESC/POS.
- Abrir RawBT mediante su enlace directo de Android con el contenido del ticket ya preparado.
- RawBT recibe, imprime y devuelve al usuario a STOCKIA; no interviene la vista previa de Chrome.
- Mantener el formato actual: Berlín Valdivia, CORTESÍA, producto, cantidad, motivo, fecha y referencia.
- Mostrar confirmación inmediata en STOCKIA: **Cortesía emitida · enviando a impresora**.
- Desbloquear el botón apenas se guarde la cortesía; la impresión no debe mantener cargando toda la pantalla.
- Si RawBT no responde, mostrar **Reintentar impresión** sin volver a crear la cortesía.

Primero se aplica solo a **Cortesías**, que es el flujo urgente. Después de validarlo físicamente, el mismo camino se reutiliza en guardarropía y POS.

## 2. Flujo rápido en la tablet

- El administrador toca **Emitir e imprimir** una sola vez.
- La cortesía se registra primero, para no perderla si falla Bluetooth.
- RawBT se abre directamente e imprime.
- Al volver a STOCKIA, el formulario queda limpio y listo para la siguiente cortesía.
- La lista de la noche conserva **Reimprimir**, que vuelve a enviar el mismo ticket a RawBT.

## 3. Respaldo si la impresión directa no abre

- Detectar si la tablet no puede abrir RawBT.
- En ese caso, ofrecer únicamente **Reintentar con RawBT** y **Compartir ticket**; no regresar al diálogo de vista previa que queda bloqueado.
- Mantener la cortesía registrada y visible en la lista aunque la impresión falle.

## Validación en tablet

1. Probar un cover con una unidad y motivo Socio.
2. Probar varias unidades y un nombre de producto largo.
3. Medir desde el toque hasta el inicio de impresión; objetivo: RawBT abierto en menos de un segundo.
4. Apagar la impresora, emitir una cortesía y confirmar que queda registrada y puede reimprimirse al reconectar.
5. Confirmar que dos toques rápidos no generan dos cortesías.

## Detalles técnicos

- Crear un adaptador Android `printViaRawBT` que codifique texto/ESC-POS y abra el esquema compatible de RawBT.
- `printCourtesyCover` dejará de crear popups y devolverá el contenido térmico listo para RawBT.
- `Cortesias.tsx` separará claramente `saving` de `printing`: guardado idempotente, feedback inmediato y lanzamiento de impresión sin espera.
- En equipos no Android se conserva temporalmente la impresión del navegador como compatibilidad; en las Galaxy se usará siempre RawBT.
- El flujo de PDF no forma parte de este ajuste: la prioridad es imprimir la cortesía con un toque y sin vista previa.
