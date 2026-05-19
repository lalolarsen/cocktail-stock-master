# Notificaciones de cierre de jornada — arreglo completo

## Diagnóstico

Hoy las notificaciones **no llegan nunca**. Tres fallas combinadas:

1. **El trigger no está instalado.** La función `enqueue_financial_summary_notifications` existe pero no está enganchada a `jornada_financial_summary`. Hay 22 resúmenes y 0 filas en `notification_logs`. Nada se encola al cerrar.
2. **El edge function `send-financial-summary` usa Resend con `onboarding@resend.dev`**, que solo entrega al dueño de la cuenta Resend. Aunque hubiera filas encoladas, los correos no llegarían a gerencia/externos. Además no está en cron, así que ni siquiera se ejecuta.
3. **El encolado ignora destinatarios reales.** La función filtra solo `role = 'gerencia'`, no lee `jornada_notification_emails` (los correos externos del módulo de Notificaciones), no respeta `notification_preferences`, y excluye a `admin`.

Resultado: el módulo de Notificaciones permite configurar correos, pero ninguno recibe nada.

## Objetivo

Que al cerrar una jornada se envíe el resumen financiero por correo (vía Lovable Emails, dominio `notify.stockiachile.com` ya verificado) a:
- Workers gerencia/admin con `notification_email` y preferencia `jornada_closed` activa.
- Todos los correos externos habilitados en `jornada_notification_emails` del venue.

## Plan

### 1. Template transaccional `jornada-financial-summary`
Nuevo archivo `supabase/functions/_shared/transactional-email-templates/jornada-financial-summary.tsx` (React Email). Muestra el mismo contenido que el HTML actual: KPIs, tabla EERR, metadata. Recibe por props: `venueName`, `jornadaNumero`, `jornadaFecha`, `ingresosBrutos`, `costoVentas`, `utilidadBruta`, `margenBruto`, `gastosOperacionales`, `resultadoPeriodo`, `closedByName`, `closedAt`. Estilo según branding (fondo blanco obligatorio, acentos primary). Registrarlo en `registry.ts`.

### 2. Rehacer `enqueue_financial_summary_notifications` (trigger en `jornada_financial_summary`)
Una sola función que, al insertarse el resumen, encola filas en `notification_logs` (event_type `financial_summary`, status `queued`) para:
- Workers con `worker_roles.role IN ('admin','gerencia')`, `is_active`, `notification_email` no nulo, y sin preferencia `jornada_closed/email` deshabilitada.
- Cada fila habilitada en `jornada_notification_emails` del `venue_id` del resumen (`recipient_worker_id = NULL`).
- Idempotencia: `idempotency_key = 'financial_summary:' || jornada_id || ':' || lower(email)`.
- Crear el trigger `AFTER INSERT` en `jornada_financial_summary` (no existe hoy).

### 3. Reescribir `send-financial-summary` para usar Lovable Emails
- Quitar dependencia de Resend y de `onboarding@resend.dev`.
- Para cada notificación `queued` con `event_type='financial_summary'`, leer el resumen y llamar a `supabase.functions.invoke('send-transactional-email', { body: { templateName: 'jornada-financial-summary', recipientEmail, idempotencyKey: 'jornada-fs-<jornada>-<email>', templateData: {...} } })`.
- Actualizar `notification_logs.status = 'sent' / 'failed'` según resultado.
- Conservar el bypass de demo y el control de reintentos.
- Quitar el adjunto CSV (Lovable Emails no soporta adjuntos). Si se requiere, se puede agregar después un link de descarga firmado; por ahora el HTML lleva toda la info.

### 4. Disparar el dispatcher
Agregar cron `pg_cron` cada 1 min que invoque `send-financial-summary` con la service-role key (vía `net.http_post`). Migración aplicada con la SQL típica usada por `setup_email_infra`. Así no dependemos de que el cliente lo llame y se reintenta solo.

### 5. Backfill controlado (opcional, una vez)
Migración manual: insertar en `notification_logs` los registros faltantes solo para jornadas cerradas en los últimos 7 días, para que la gerencia reciba los pendientes recientes. Idempotente gracias al `idempotency_key`.

### 6. UI módulo Notificaciones
Sin cambios funcionales mayores. Solo:
- Mostrar en el historial el `event_type` (hoy se omite) para distinguir `financial_summary` vs futuros.
- Botón "Reintentar fallidos" que reencole (`update set status='queued'` donde `status='failed' AND created_at > now()-interval '24h'`) y dispare el dispatcher.

## Detalles técnicos

**SQL clave (resumen del trigger):**
```text
AFTER INSERT ON jornada_financial_summary
  → para cada destinatario (workers + jornada_notification_emails)
    INSERT INTO notification_logs (... status='queued', event_type='financial_summary',
      idempotency_key='financial_summary:<jornada>:<email>') ON CONFLICT DO NOTHING
```

**Edge function (núcleo):**
```text
SELECT * FROM notification_logs WHERE status='queued' AND event_type='financial_summary' LIMIT 50
  → cargar jornada_financial_summary + venue + jornada + profile(closed_by)
  → invoke('send-transactional-email', { templateName, recipientEmail, templateData, idempotencyKey })
  → UPDATE notification_logs SET status='sent'/'failed', sent_at, error_message
```

**Archivos tocados:**
- Nuevo: `supabase/functions/_shared/transactional-email-templates/jornada-financial-summary.tsx`
- Editado: `supabase/functions/_shared/transactional-email-templates/registry.ts`
- Reescrito: `supabase/functions/send-financial-summary/index.ts`
- Migración SQL: trigger `enqueue_financial_summary_notifications` + cron job + backfill 7d
- Editado: `src/components/dashboard/NotificationsManagement.tsx` (mostrar event_type, botón reintentar)

## Fuera de alcance
- Adjuntar CSV/PDF del resumen al correo (Lovable Emails no soporta adjuntos; queda para una iteración con link firmado a Storage).
- Notificaciones in-app o push.
- Cambiar el cálculo del resumen financiero.
