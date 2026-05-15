## Estado actual (verificado en BD)

- En `courtesy_qr` hay 15 QR generados → **todos siguen `status=active`, `used_count=0`**.
- En `courtesy_redemptions` hay **0 filas**.
- El RPC `redeem_courtesy_qr` (versión 3-arg) **sí está bien**: descuenta `used_count`, cambia `status`, e inserta una fila en `courtesy_redemptions` (incluso fallidos: `cancelled / expired / already_redeemed`).
- El front de Barra (`src/pages/Bar.tsx` línea 361) llama correctamente al RPC con `p_pos_source: "bar"`.

Conclusión: el flujo "no quema" porque el RPC nunca llega a ejecutarse o devuelve un error que la UI silencia. Hoy no hay forma de saber por qué (no hay toast de error visible al bartender, ni traza en `courtesy_redemptions` cuando falla la auth o el venue).

## Cambios

### 1. Hacer visible el resultado del canje de cortesía en Barra

Archivo: `src/pages/Bar.tsx`
- Mostrar en el banner de resultado el **error real** devuelto por el RPC (`UNAUTHENTICATED`, `FORBIDDEN`, `VENUE_NOT_FOUND`, `TOKEN_NOT_FOUND`, `TOKEN_CANCELLED`, `TOKEN_EXPIRED`, `ALREADY_REDEEMED`) con label en español, igual que ya se hace para `redeem_pickup_token`.
- Agregar `toast.error(...)` además del banner cuando el canje cortesía falla, para que el bartender no lo deje pasar.
- Loguear en consola el `data` y `error` crudo del RPC (con prefijo `[BarCourtesy]`) para poder diagnosticar el siguiente caso real.

### 2. Endurecer el RPC para que SIEMPRE deje rastro

Migración SQL sobre `redeem_courtesy_qr (3-arg)`:
- Insertar también una fila en `courtesy_redemptions` con `result='fail'` y `reason` ∈ {`unauthenticated`, `forbidden`, `venue_not_found`, `not_found`} en los caminos donde hoy retorna error sin loguear.
- Esto garantiza que cualquier intento aparezca en el reporte de auditoría (hoy esos casos no dejan ninguna huella, lo que explica que veamos 0 filas mientras los bartenders sí escanean).

### 3. Reporte CORTESÍAS dentro del ticket POS térmico

Archivo: `src/lib/printing/pos-sales-report.ts` + `src/components/dashboard/reports/JornadaDownloadMenu.tsx`

Reemplazar el bloque actual ("QR emitidos / canjeados / Top productos") por una **lista detallada de cada canje exitoso** de la jornada:

```text
CORTESÍAS DE LA JORNADA
----------------------------------------
01:42  JAGER + BEBIDA           x1
       "Cumpleaños socio Juan"
01:55  GIN 97                    x1
       "Cortesía staff"
02:10  PRUEBA                    x1
----------------------------------------
Emitidos: 3   Canjeados: 3
```

Por cada canje se imprime: hora (HH:mm), producto, cantidad, y nota/observación (`courtesy_qr.note`) si existe. Si la jornada no tiene canjes, se omite el bloque entero.

`JornadaDownloadMenu.tsx` debe traer también `redeemed_at` y hacer JOIN con `courtesy_qr` para `product_name`, `qty`, `note`.

### 4. Descargable desde Admin (PDF de cortesías de la jornada)

Reemplazar el CSV actual de `CourtesyQR.tsx` (que mezcla todo histórico y es ilegible) por un **PDF de cortesías por jornada** disponible en `JornadaDownloadMenu`.

Archivo nuevo: `src/lib/reporting/courtesy-jornada-pdf.ts`

Contenido del PDF (jsPDF + autoTable, mismo patrón que `product-sales-pdf.ts`):
- Cabecera: "Reporte de Cortesías — Jornada #N — fecha".
- KPIs: emitidos, canjeados, valor estimado (suma de `qty × cocktails.price` cuando exista).
- Tabla con columnas: **Hora · Producto · Cantidad · Observación · Código · Canjeado por · POS (Barra/Híbrido)**.
- Pie: total de canjes y desglose por canal (bar vs hybrid_pos).

Botón "Cortesías (PDF)" en `JornadaDownloadMenu.tsx`, junto a los demás reportes de jornada.

### 5. Limpieza menor

- Quitar el botón "Descargar CSV" actual de `CourtesyQR.tsx` (queda redundante) o mantenerlo solo como export histórico desde el tab Auditoría con las mismas columnas que el PDF.

## Detalles técnicos

- Sin cambios en el flujo de inventario: cortesía sigue sin descontar stock (es así por diseño en `courtesy-qr-system`).
- `redeemed_at` viene en UTC; formatear con `Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })` (regla CLP/Santiago de la memoria).
- La migración del RPC mantiene la firma `(p_code, p_jornada_id, p_pos_source)` — solo agrega INSERTs adicionales, no rompe llamadores existentes.
- No tocar la versión 2-arg del RPC (deprecada pero aún referenciada en types). Se eliminará en una siguiente iteración si nada la usa.

## Fuera de alcance

- No se cambia el diseño de generación del QR (`COURTESY:<code>`) ni el parseo (`src/lib/qr.ts`) — ya funcionan.
- No se agrega un canjeador manual desde Admin: el rebuild original (#2060) ya lo dejó vía `redeem_courtesy_qr` y el problema actual no es de UI de admin sino de visibilidad y reporte.
