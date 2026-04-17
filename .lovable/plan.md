
## Diagnóstico

Hay dos fallas separadas que explican exactamente lo que ves:

1. **Los canjes de tickets no quedan cayendo en la jornada correcta del log de redención**
   - El CSV que subiste muestra: **401 emitidos, 0 canjeados**.
   - `RedeemReportButton`, `RedeemReconciliationPanel` e `InventoryComparisonModule` leen desde `pickup_redemptions_log` filtrando por `jornada_id`.
   - Pero el flujo de tickets usa `ticket_sales` + `pickup_tokens`, y el RPC `redeem_pickup_token` hoy no garantiza que el canje de un token de ticket se registre con la **jornada fuente del token**. Si no hay jornada abierta, o si cambia la jornada activa, el log queda en otra jornada o nulo.
   - Resultado: el token existe y fue emitido para la jornada, pero el canje no aparece en el reporte ni en Comparación.

2. **El reporte general POS no integra bien `ticket_sales`**
   - Varias vistas/reportes siguen agregando solo desde `sales`.
   - Las entradas se venden en `ticket_sales`, así que quedan fuera del consolidado POS general aunque sí existan en caja tickets.

## Qué voy a corregir

### 1) Arreglar el backend del canje para tickets
Crear una migración para ajustar `redeem_pickup_token` y resolver una `effective_jornada_id` así:

```text
effective_jornada_id =
  jornada abierta actual
  o pickup_tokens.jornada_id
  o sales.jornada_id
  o ticket_sales.jornada_id
```

Luego usar esa jornada efectiva en **todos los inserts** a `pickup_redemptions_log` del flujo ticket/covers.

También dejaré en el log metadata explícita del origen ticket para auditoría más clara.

### 2) Integrar tickets al reporte general POS
Actualizar frontend para que el consolidado de jornada sume ambas fuentes:

- `sales`
- `ticket_sales`

Afecta principalmente:
- `src/components/dashboard/ReportsPanel.tsx`
- `POSReportButton` dentro de ese mismo archivo
- `src/components/dashboard/AdminOverview.tsx`

Con eso:
- el reporte POS general mostrará ventas de entradas,
- los totales por medio de pago incluirán tickets,
- el resumen de jornada no quedará subcontado.

### 3) Hacer que los KPIs de canje usen el log correcto
Donde hoy se cuentan redenciones solo por `sale_id` de `sales`, los cambiaré a la lógica canónica:
- contar `pickup_redemptions_log`
- filtrar por `jornada_id`
- `result = 'success'`

Eso permite contar también canjes de tickets/covers.

### 4) Recuperar la jornada 45 históricamente
Además del fix hacia adelante, haré una corrección de datos para los registros ya existentes:
- tomar `pickup_redemptions_log` de tickets con jornada nula o incorrecta,
- resolver la jornada desde `pickup_token_id -> pickup_tokens.jornada_id`,
- reasignarlos a la jornada correcta.

Así no solo quedará arreglado lo nuevo: también debería aparecer la actividad faltante de la última jornada.

## Impacto esperado

Después del arreglo:

- el reporte de canjes de la jornada ya no mostrará “Emitidos 401 / Canjeados 0” si sí hubo canjes,
- `Comparación` e `InventoryComparisonModule` volverán a mostrar consumo teórico de tickets/covers,
- el reporte general POS incluirá ventas de tickets junto con alcohol,
- los KPIs de “QRs Canjeados” dejarán de ignorar tickets.

## Archivos / piezas a tocar

- `supabase/migrations/...sql` — patch de `redeem_pickup_token` + backfill de logs
- `src/components/dashboard/ReportsPanel.tsx`
- `src/components/dashboard/AdminOverview.tsx`

Posibles ajustes menores según revisión final:
- `src/components/dashboard/RedeemReportButton.tsx`
- `src/components/dashboard/RedeemReconciliationPanel.tsx`
- `src/components/dashboard/InventoryComparisonModule.tsx`

## Validación final

Voy a dejar validado este flujo:

1. vender ticket en Caja Tickets,
2. canjear el QR,
3. revisar que aparezca en:
   - reporte de canjes de la jornada,
   - comparación de inventario,
   - consolidado POS general,
4. volver a exportar la jornada 45 para confirmar que ahora sí muestre los canjes.
