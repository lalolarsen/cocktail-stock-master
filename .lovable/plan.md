## Objetivo

Eliminar la fricción del cierre de jornada (hoy obliga a confirmar 7 POS + nombre de bartender + checklist). Reemplazar por **un solo cierre con una observación global opcional** sobre el cuadre, que quede registrada en la jornada y aparezca en el email de cierre y reportes.

## Cambios

### 1. Backend — RPC `close_jornada_manual` (migración SQL)
Simplificar la función:
- Quitar la validación que exige una entrada por cada POS activo (`missing_pos`).
- Aceptar un nuevo parámetro opcional `p_observacion text` (texto libre del cuadre).
- Guardar esa observación en `jornadas.observacion_cierre` (columna nueva `text NULL`).
- Mantener el dispatch automático del email (`dispatch_jornada_closed_email`) intacto.
- El parámetro `p_cash_closings` queda opcional (default `'[]'::jsonb`); si viene vacío, no se exige checklist.

### 2. Frontend — Diálogo de cierre
Reemplazar `CashReconciliationDialog.tsx` por un diálogo mucho más simple:
- Título: "Cerrar jornada".
- Un solo campo `Textarea` opcional: **"Observación del cuadre (opcional)"** con placeholder "Ej: Caja Principal cuadró exacto, Pista con sobrante de $5.000 sin justificar…".
- Un botón "Cerrar jornada" que llama al RPC con `{ p_jornada_id, p_observacion }`.
- Sin tarjetas por POS, sin firmas, sin checkboxes.
- Mensaje informativo: "El arqueo financiero se hace fuera del sistema. Esta observación quedará en el reporte enviado a gerencia."

### 3. Email de cierre — `jornada-closed-summary.tsx`
Añadir una sección destacada "**Observación del cuadre**" justo bajo la cabecera, mostrando el texto si existe (si está vacío, omitir la sección). Estilo dark/minimal coherente con la plantilla actual.

### 4. RPC del email — `dispatch_jornada_closed_email`
Incluir `j.observacion_cierre` en el `templateData` enviado al edge function.

### 5. Reporte físico / cashier PDF
En `src/lib/reporting/jornada-cashier-report.ts` (y reporte térmico de POS si aplica), agregar la observación global al pie del documento como "Observación del cierre: …".

## Notas

- Se mantiene la opción de **forzar cierre** con motivo para casos excepcionales (sin cambios).
- Memoria a actualizar: `mem://features/jornada/physical-checklist-close` queda obsoleta — se reemplaza por "cierre simple con observación global opcional".
- No se borra `jornada_cash_closings` (tabla histórica), simplemente deja de ser obligatoria.

## Archivos tocados

- Migración SQL nueva: simplificar `close_jornada_manual` + columna `jornadas.observacion_cierre` + actualizar `dispatch_jornada_closed_email`.
- `src/components/dashboard/CashReconciliationDialog.tsx` — rediseño minimal (o renombrar a `CloseJornadaDialog.tsx`).
- `supabase/functions/_shared/transactional-email-templates/jornada-closed-summary.tsx` — sección observación.
- `src/lib/reporting/jornada-cashier-report.ts` — incluir observación al pie.
- Memoria: actualizar `mem://features/jornada/physical-checklist-close`.
