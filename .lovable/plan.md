# Reportes automáticos por email al cerrar jornada

## Diagnóstico

La infraestructura existe parcialmente pero **no se dispara nada al cerrar la jornada**:

- Tabla `notification_logs` (cola de envíos) ✅
- Tabla `notification_preferences` (qué gerencia recibe qué) ✅
- UI **Notificaciones** en Admin para configurar emails de gerencia ✅
- Edge function `send-jornada-summary` que procesa la cola y envía emails ✅ (pero usa Resend con remitente `onboarding@resend.dev` y un resumen muy básico)
- **Falta:** lógica que al cerrar jornada (`close_jornada_manual`) inserte filas en `notification_logs` para cada gerencia activa
- **Falta:** dispararlo automáticamente y que el email incluya desglose por POS, tickets, cortesías, comisión STOCKIA y cuadre — la misma información del reporte físico actual

## Plan

### 1. Disparo automático al cerrar jornada
Modificar la función SQL `close_jornada_manual` para que, tras marcar la jornada como cerrada, encole una fila en `notification_logs` por cada miembro de gerencia/admin activo con `notification_email` definido y `notification_preferences.is_enabled = true` para `jornada_closed`. Idempotency key = `jornada-close-{jornada_id}-{worker_id}` para evitar duplicados si se reintenta.

Tras encolar, llamar a la edge function `send-jornada-summary` vía `pg_net` (extension ya disponible) pasando `{ jornada_id }` para envío inmediato. Si falla la red, las filas quedan en cola y un cron las recoge.

### 2. Cron de respaldo cada 5 minutos
Job `pg_cron` que invoque `send-jornada-summary` sin `jornada_id` para drenar cualquier notificación quedada en `queued`.

### 3. Email enriquecido (mismo nivel que reporte físico)
Reescribir `send-jornada-summary/index.ts` para que el resumen incluya:

- **Cabecera:** venue, jornada #, fecha, horario apertura/cierre, motivo si fue cierre forzado
- **Resumen general:** total bruto, comisión STOCKIA (2.5% informativa), # transacciones, total cortesías
- **Desglose por POS** (igual al reporte físico):
  - Alcohol/Carta: efectivo / tarjeta / otro (monto + cantidad)
  - Tickets entrada: efectivo / tarjeta / otro
  - Cuadre efectivo: apertura + ventas efectivo = esperado, contado, diferencia
  - Bartender firmante, observaciones, estado confirmado
- **Top 10 productos** (cantidad e ingresos)
- **Alertas de stock bajo** generadas en la jornada
- **Mermas aprobadas** del día con costo
- **Indicador "cierre forzado"** si aplica (rojo, con motivo)
- **PDF adjunto: Estado de Resultados (EERR)** del día — generado server-side desde `useCOGSData` equivalente RPC, con net sales, COGS, mermas, OPEX, resultado operacional
- Link al panel web para ver más detalle

Estilo: dark/minimal STOCKIA (negro, primary verde #00E676, blanco), SF/Inter, sin emojis decorativos.

### 4. Migrar a Lovable Emails (recomendado)
Reemplazar Resend (`onboarding@resend.dev` no es profesional) por Lovable Emails con dominio del cliente. Esto requiere:
- Configurar dominio sender (`notify.stockiachile.com`) — diálogo de setup
- Scaffolding de transactional email infra
- Plantilla React Email `jornada-closed-summary` que recibe el payload por `templateData`
- La edge function `send-jornada-summary` pasa a invocar `send-transactional-email` por destinatario

Si el cliente prefiere mantener Resend en el corto plazo, sólo actualizamos `from` a un dominio verificado y enriquecemos el HTML.

### 5. Mejora UI Admin → Notificaciones
- Mostrar **última fecha de envío exitoso** y **% de éxito** por destinatario
- Botón **"Reenviar resumen de jornada X"** para casos en que un gerente no recibió
- Toggle global "Pausar envíos de jornada" (útil para marcha blanca)

## Detalles técnicos

**Migración SQL (resumen):**
- `CREATE OR REPLACE FUNCTION close_jornada_manual` — añadir bloque al final que:
  1. `INSERT INTO notification_logs (event_type, jornada_id, recipient_email, recipient_worker_id, idempotency_key, email_subject, status, venue_id) SELECT 'jornada_closed', p_jornada_id, p.notification_email, p.id, 'jornada-close-' || p_jornada_id || '-' || p.id, 'Cierre de Jornada #' || jornada.numero_jornada, 'queued', jornada.venue_id FROM profiles p JOIN worker_roles wr ON wr.worker_id = p.id WHERE wr.role IN ('gerencia','admin') AND p.is_active AND p.notification_email IS NOT NULL AND NOT EXISTS (...preferences disabled...) ON CONFLICT (idempotency_key) DO NOTHING;`
  2. `PERFORM net.http_post(url := '<project>/functions/v1/send-jornada-summary', headers := ..., body := jsonb_build_object('jornada_id', p_jornada_id));`
- Habilitar `pg_net` y `pg_cron` (ya están)
- Crear cron job de respaldo

**Edge function `send-jornada-summary`** — payload por POS reutiliza la misma query que `usePOSSalesReport` (ver `src/lib/printing/pos-sales-report.ts`): cash_registers + sales agregadas + ticket_sales + courtesy_qrs + waste_records.

**EERR PDF** — generado con `jspdf` server-side (Deno-compatible vía `https://esm.sh/jspdf`) o como tabla HTML embebida en el cuerpo del email para evitar adjuntos (más confiable en bandeja de entrada).

## Archivos que se tocan

- `supabase/migrations/<new>.sql` — modificar `close_jornada_manual` + cron
- `supabase/functions/send-jornada-summary/index.ts` — reescribir resumen y envío
- `src/components/dashboard/NotificationsManagement.tsx` — métricas de éxito + botón reenviar
- (Opcional Lovable Emails) `supabase/functions/_shared/transactional-email-templates/jornada-closed-summary.tsx` + scaffolding

## Pregunta antes de implementar

¿Prefieres que use **Lovable Emails con tu propio dominio** (`notify.stockiachile.com`, requiere ajustar DNS una vez, queda profesional y permanente) o que mantengamos **Resend con un dominio verificado** que ya tengas? Si no tienes preferencia, recomiendo Lovable Emails — es la opción más limpia y no requiere API keys adicionales.
