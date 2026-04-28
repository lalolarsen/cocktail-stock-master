
## Rediseño del cierre de jornada

El arqueo financiero se hace **fuera del sistema** (sobre el reporte físico descargable de cada POS). El cierre dentro de la app pasa a ser un **checklist de confirmación firmado por POS**, con observaciones que viajan al reporte POS de Reportes.

---

### 1. Nuevo flujo de "Cerrar Jornada" (`CashReconciliationDialog.tsx`)

Se reemplaza el wizard actual (Resumen → Arqueo numérico → Confirmación) por un único paso:

**Para cada POS activo (cash register):**
- Tarjeta con nombre del POS + ubicación.
- Campo "Bartender / Cajero de turno" (texto, obligatorio) — actúa como firma.
- Checkbox obligatorio: *"Confirmo que el cuadre físico fue realizado y firmado por el bartender de turno"*.
- Textarea "Observaciones del POS" (opcional, multilínea).

**Validación:** No se puede cerrar hasta que TODOS los POS tengan checkbox marcado y nombre de bartender escrito.

Botón final: **"Cerrar jornada"** (sin pasos intermedios). Se elimina el cálculo de efectivo esperado/contado/diferencia desde la UI.

---

### 2. Cambios de base de datos

**Migración (schema):**
- Agregar columnas a `jornada_cash_closings`:
  - `bartender_name TEXT` — firma del cajero/bartender de turno
  - `physical_reconciliation_confirmed BOOLEAN DEFAULT false` — checkbox de confirmación
- Hacer **opcionales** las columnas numéricas (`opening_cash_amount`, `cash_sales_total`, `expected_cash`, `closing_cash_counted`, `difference`) ya que el cuadre es externo. Se siguen calculando y guardando como referencia, pero ya no bloquean el cierre.

**RPC `close_jornada_manual` (rediseñado):**
- Sigue recibiendo `p_cash_closings jsonb` pero con nueva forma:
  ```json
  [{ "pos_id": "...", "bartender_name": "Juan Pérez", "confirmed": true, "notes": "..." }]
  ```
- Validaciones nuevas:
  - Todos los POS activos cash-register deben venir en el array.
  - Cada entrada debe tener `confirmed = true` y `bartender_name` no vacío.
- Se elimina la validación de "diferencia justificada" (ya no aplica).
- Sigue calculando `expected_cash`, `cash_sales_total`, etc. internamente y guardándolos en `jornada_cash_closings` como información de respaldo histórico, pero `closing_cash_counted` y `difference` se guardan como `NULL`.

---

### 3. Reporte POS descargable (Reportes)

Se actualiza `pos-sales-report.ts` y `JornadaDownloadMenu.tsx` para que el reporte térmico incluya, debajo de cada bloque por POS:

```
----------------------------------------
Bartender: Juan Pérez
[X] Cuadre físico confirmado
Observaciones:
  Sobró $2.000 en caja chica.
  Se reportó al supervisor.
----------------------------------------
```

`fetchJornadaLiveReport` se extiende para hacer un `JOIN` con `jornada_cash_closings` y devolver `bartenderName`, `confirmed` y `notes` por cada `posId`.

---

### 4. Limpieza UI

- Se elimina el paso de "Resumen de Jornada" del diálogo (ya está en Reportes).
- Se elimina el paso de arqueo numérico.
- El diálogo queda compacto: una lista vertical de POS con checklist, y un botón "Cerrar jornada".

---

### Archivos a modificar

- `supabase/migrations/<new>.sql` — schema changes en `jornada_cash_closings` + nuevo `close_jornada_manual`.
- `src/components/dashboard/CashReconciliationDialog.tsx` — rediseño completo (renombrar conceptualmente, mantener nombre por compatibilidad).
- `src/lib/jornada-reporting.ts` — incluir datos de cierre por POS.
- `src/lib/printing/pos-sales-report.ts` — renderizar bartender + confirmación + observaciones.
- `src/components/dashboard/reports/JornadaDownloadMenu.tsx` — pasar nuevos campos al reporte.

---

### Resultado esperado

- **Cerrar jornada en segundos**: solo confirmar cuadre físico por POS y firmar.
- **Trazabilidad**: queda registrado quién firmó cada caja y sus observaciones.
- **Reporte POS** descargable desde Reportes muestra todo el contexto firmado, listo para auditoría.
