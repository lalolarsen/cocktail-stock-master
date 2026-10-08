# Impresión confiable en tablets (Cortesías, Guardarropía, Entradas)

## Qué pasa hoy
En tablets la app entrega el comprobante a RawBT con un "salto" a la app de impresión. Ese salto se hace **después** de guardar la venta en el sistema (espera de red). Chrome en Android a veces bloquea ese salto si pasó tiempo desde el toque del trabajador, y lo hace en silencio: la venta queda registrada pero no sale papel. Esto explica que falle "a veces" y solo en tablets. (Diagnóstico probable; se confirmará en la primera etapa con un registro de cada intento.)

## Alternativas evaluadas
1. **Solo botón de reimpresión** — simple, pero el trabajador no sabe cuándo falló y puede duplicar.
2. **Imprimir con el toque del usuario (botón "Imprimir" tras guardar)** — elimina el bloqueo de Chrome, pero suma un toque por venta.
3. **Envío directo por Bluetooth desde el navegador (Web Bluetooth)** — sin RawBT, pero la compatibilidad con impresoras SD-… no está garantizada y requiere emparejar en cada sesión.
4. **Recomendada: combinación 2 + reimpresión única controlada + registro de impresión.**

## Propuesta (recomendada)
1. **Intento automático + respaldo con un toque**: tras cobrar, la app intenta imprimir. Si en ~2 s la tablet no salió hacia RawBT (la página sigue visible), aparece un aviso grande "No se envió la impresión — Tocar para imprimir". Ese toque nunca es bloqueado.
2. **Reimpresión única**: en el detalle de cada venta/cortesía/guardarropía de la jornada, botón "Reimprimir (1 vez)". Queda marcado como **REIMPRESIÓN** en el papel, con quién y a qué hora; luego se desactiva. Un administrador puede autorizar reimpresiones adicionales.
3. **Estado visible en el detalle**: cada comprobante muestra "Enviado", "Pendiente" o "Reimpreso" y la lista "Últimas ventas" de la tablet resalta las pendientes.
4. **Registro para auditoría**: cada intento (automático, manual, reimpresión) queda guardado, para ver en los reportes de jornada cuántas reimpresiones hubo y por quién; evita que se usen para entregar covers de más.
5. **Ayuda**: el botón Ayuda agrega "Si no imprime: toque el aviso amarillo o use Reimprimir en el detalle".

## Detalles técnicos
- Nueva tabla `print_jobs` (venue_id, jornada_id, source: ticket|courtesy|coatcheck, ref_id, kind: auto|manual|reprint, status, user_id, created_at) con RLS por venue; `reprint_count` validado en servidor (función SECURITY DEFINER que permite 1 reimpresión salvo rol admin).
- `src/lib/printing/rawbt.ts` unificado: `sendToRawBt(payload)` detecta éxito por `visibilitychange`/`blur` en 2 s; devuelve `sent | not_sent`. Lo usan `ticket-print.ts`, `courtesy-cover.ts`, `coatcheck-ticket.ts`, `jornada-cashier-report.ts`.
- Payload se construye antes de la espera de red cuando es posible; si no, se ofrece el toque de respaldo.
- Componente `PrintFallbackBanner` y botón `ReprintButton` en Tickets, Cortesías y Guardarropía (lista de últimas ventas/detalle); payload de reimpresión con leyenda "REIMPRESIÓN".
- Reportes de jornada (PDF/correo) agregan conteo de reimpresiones por caja.
- Prueba en tablet simulada: forzar bloqueo, ver aviso, reimprimir una vez y comprobar que la segunda queda bloqueada.
