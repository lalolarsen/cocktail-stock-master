## Objetivo

Rediseñar el correo de cierre de jornada para que muestre **solo** la información solicitada, en este orden:

1. Observación del cierre (ya está al inicio).
2. Información de la jornada → incluir **nombre de la jornada** + **usuario que la cerró**.
3. Resumen financiero → estilo reporte POS térmico: por cada POS, ventas separadas por medio de pago (Efectivo / Tarjeta / Otro), y si aplica, sub-bloque Tickets de entrada.
4. **QR de cortesía emitidos**, agrupados por usuario que los emitió.

Se eliminan del correo las secciones que el usuario no pidió (Top productos, COGS, Margen bruto, Mermas, Alertas de stock, "QRs canjeados / pendientes").

---

## Cambios

### 1. Base de datos

- **`jornadas`**: agregar columna `closed_by_user_id uuid` con FK a `auth.users(id)` (sin ON DELETE CASCADE — usar SET NULL para preservar historial).
- **RPC `close_jornada_manual`**: setear `closed_by_user_id = auth.uid()` en el `UPDATE jornadas SET estado='cerrada' …`.
- **Cierre forzado**: si existe RPC separado `forced_close_jornada` (o equivalente), también setear `closed_by_user_id` con el usuario que ejecutó el cierre.

### 2. RPC `dispatch_jornada_closed_email(p_jornada_id)`

Reescribir el payload `data` que se envía a `send-transactional-email`. Calcular y enviar **solo**:

- `venue_name`, `jornada_label` (= `jornadas.nombre`, fallback `'Jornada N° X · YYYY-MM-DD'`).
- `opened_at`, `closed_at`, `forced_close`, `forced_reason`, `observacion_cierre`.
- `closed_by_name`: lookup `profiles.full_name` o `auth.users.email` desde `closed_by_user_id` (o `forced_by_user_id` si fue cierre forzado). Fallback `'Sistema'`.
- `total_gross`, `stockia_commission` (1%), `total_net`.
- `pos_breakdown` (nueva forma, igual al reporte POS):
  ```
  [{ pos_name, alcohol: { cash, cash_count, card, card_count, other, other_count },
                tickets: { cash, cash_count, card, card_count, other, other_count } | null,
                total, total_count }]
  ```
  Fuente: `sales` (alcohol/carta) + `ticket_sales` (tickets) agrupados por `pos_locations.name` y `payment_method` (`cash` / `card` / cualquier otro → "other"), filtrados por `jornada_id` y no cancelados / `payment_status='paid'`.
- `courtesies_issued`: lista agrupada por usuario emisor:
  ```
  [{ issuer_name, qr_count, total_uses, redeemed_count }]
  ```
  Fuente: `courtesy_qr` filtrado por `venue_id = v_jornada.venue_id` y `created_at` entre `fecha_apertura` y `fecha_cierre` (rango de la jornada). `redeemed_count` se calcula con `courtesy_redemptions` joined a esos `courtesy_qr`. `issuer_name` viene de `profiles.full_name` por `created_by`.

Eliminar del payload: `cogs`, `gross_margin`, `top_products`, `qr_redeemed`, `qr_pending`, `courtesies_count`, `courtesies_cost`, `waste_cost`, `stock_alerts`.

### 3. Template `supabase/functions/_shared/transactional-email-templates/jornada-closed-summary.tsx`

Reestructurar a las 4 secciones exactas, en este orden:

```text
┌─────────────────────────────────────┐
│ Header: Cierre de Jornada · Venue   │
├─────────────────────────────────────┤
│ [Observación del cierre]  ← si hay  │
├─────────────────────────────────────┤
│ Información de la jornada           │
│   Jornada: <jornada_label>          │
│   Apertura / Cierre                 │
│   Cerrado por: <closed_by_name>     │
├─────────────────────────────────────┤
│ Resumen financiero                  │
│   Ventas brutas / Comisión / Neto   │
│   Por cada POS:                     │
│     POS Nombre                      │
│       ALCOHOL / CARTA               │
│         Efectivo (n)        $...    │
│         Tarjeta  (n)        $...    │
│         Otro     (n)        $...    │
│       TICKETS (entrada)  ← si hay   │
│         Efectivo / Tarjeta / Otro   │
│       Total POS  (N tx)     $...    │
├─────────────────────────────────────┤
│ Cortesías emitidas                  │
│   Por <Usuario>: 4 códigos · 8 usos │
│                  (3 canjeados)      │
│   …                                 │
└─────────────────────────────────────┘
```

Quitar del JSX: `top_products`, `stock_alerts`, `cogs`, `gross_margin`, `waste_cost`, KPIs de QR canjeados/pendientes, sección "Cortesías" agregada actual.

Actualizar `previewData` para reflejar el nuevo shape.

### 4. Verificación

- Disparar manualmente `dispatch_jornada_closed_email('b6f9af1b-…')` (jornada de Berlín del 10/05) y reenviar el correo a `eduardolarsen101@gmail.com` para QA visual.
- Confirmar `email_send_log.status = 'sent'`.

---

## Detalles técnicos

- Migración SQL en `supabase/migrations/<timestamp>_email_jornada_redesign.sql`: `ALTER TABLE jornadas ADD COLUMN closed_by_user_id …` + `CREATE OR REPLACE FUNCTION close_jornada_manual(...)` (recreado completo) + `CREATE OR REPLACE FUNCTION dispatch_jornada_closed_email(uuid)` (recreado completo, sin top_products/alerts/cogs).
- Para el rango de cortesías usar `COALESCE(j.fecha_apertura, j.fecha) AT TIME ZONE 'America/Santiago'` y `COALESCE(j.fecha_cierre, now())` para evitar perder QRs si las columnas timestamp no están pobladas.
- Tipos TS del template (`JornadaClosedProps`) actualizados: nueva interfaz `POSBreakdownV2` y `CourtesyIssuer`; `closed_by` se mantiene como string.
- No tocar `send-jornada-summary` (legacy Resend) — el flujo en uso ya es `send-transactional-email`.

---

## Fuera de alcance

- No se modifica el reporte POS térmico, ni `useCOGSData`, ni el panel de notificaciones.
- No se agrega/quitan destinatarios (sigue tomando admins/gerencia + `jornada_notification_emails`).