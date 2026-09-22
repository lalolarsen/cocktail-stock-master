# Covers con nombre de jornada

Cada cover impreso debe decir a qué jornada pertenece, para que el staff pueda rechazar covers de noches anteriores. Se aplica a las tres piezas que hoy salen sin esa información: cortesías (tablet), covers que vienen con los tickets y covers del POS de alcohol.

## Qué cambia en el papel

En todos los covers y entradas se agrega un bloque destacado justo bajo el título (CORTESÍA / COVER / ENTRADA):

```text
        JORNADA #126
     sábado 19 sep 2026
   Válido solo esta jornada
```

- El nombre es el mismo que el administrador define al abrir la jornada (hoy sale como "sábado 19 sep 2026"; si escribió otro nombre, ese se imprime).
- Se agrega también el número de jornada, para que no haya dudas si dos noches tienen nombre parecido.
- La leyenda "Válido solo esta jornada" reemplaza la fecha de vencimiento a medianoche que hoy usan las cortesías.
- Si por algún motivo no hay jornada abierta, el cover no se emite (las cortesías ya bloquean ese caso).

## Dónde se ve

1. **Tablet de cortesías** — el cover impreso (RawBT) y la reimpresión desde la lista de la noche llevan el bloque de jornada.
2. **Covers vendidos con tickets** — cada pieza de cover y cada entrada individual llevan el bloque de jornada.
3. **Covers del POS de alcohol** — la pieza que el cliente entrega en la barra lleva el bloque de jornada.

El comprobante del cajero no cambia salvo una línea corta con la jornada, para cuadrar reclamos.

## Detalles técnicos

- `AppSessionContext` ya expone `activeJornadaId`; se amplía para exponer también `nombre` y `numero_jornada` de la jornada activa (la consulta actual solo trae `id`), de modo que cualquier pantalla pueda imprimir sin consultar de nuevo.
- `src/lib/printing/courtesy-cover.ts`: `CourtesyCoverData` recibe `jornadaName` y `jornadaNumber`; se añaden al payload ESC-POS de RawBT y al fallback de navegador. En la reimpresión se usa la jornada de la cortesía (vía `courtesy_redemptions.jornada_id`) y no la activa, para que un reimpreso antiguo no se vea como válido hoy.
- `src/lib/printing/ticket-print.ts`: `TicketSalePrintData` recibe los datos de jornada; `buildEntryHtml` y `buildCoverHtml` imprimen el bloque; `buildReceiptHtml` agrega una línea de jornada.
- `src/lib/printing/qz.ts`: `ReceiptData` recibe los datos de jornada; `buildCoverHtml` imprime el bloque y `buildCashierReceiptHtml` la línea corta.
- Llamadores a actualizar: `Cortesias.tsx`, `CourtesyQRSimple.tsx`, `CourtesyQR.tsx`, `Tickets.tsx`, `Sales.tsx`.
- Sin cambios de base de datos: `nombre` y `numero_jornada` ya existen en `jornadas`, y las cortesías ya quedan ligadas a la jornada en `courtesy_redemptions`.

## Validación

- Emitir una cortesía con jornada abierta y confirmar que el papel muestra número, nombre y la leyenda.
- Reimprimir una cortesía de una jornada anterior y confirmar que muestra esa jornada, no la de hoy.
- Vender un ticket con cover y revisar que entrada y cover traigan el bloque.
- Venta en POS de alcohol: cover con bloque, comprobante del cajero con la línea de jornada.
