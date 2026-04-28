# Inventario en tiempo real para Gerencia

## Diagnóstico

El sistema YA tiene la infraestructura base correcta:

- `stock_balances` (verdad por producto + ubicación, con venue_id e índices)
- `stock_movements` (todos los flujos: COMPRA, TRANSFERENCIA, CONTEO, salidas por venta/cortesía)
- `stock_transfers` (reposiciones bodega → barra)
- `purchases` + edge function `parse-invoice` (lector de facturas con OCR)
- `BarReplenishment`, `InventoryHub`, `InventoryComparisonModule` (UIs)
- DiStock + CPP ya operando

**Lo que falta** no es replantear el modelo, sino:
1. Cerrar los 3 flujos humanos para que cada acción golpee `stock_balances` automáticamente.
2. Construir un **panel de Gerencia en tiempo real** que lea de esa única fuente de verdad y use Realtime de Lovable Cloud para actualizarse solo.

## Flujo operativo objetivo

```text
[Compra]      Foto factura → parse-invoice → revisión humana → COMPRA en Bodega → CPP actualizado
                                                                       │
[Reposición]  Bartender abre jornada → Reposición Bodega→Barra (UI rápida) → TRANSFERENCIA
                                                                       │
[Venta]       POS / Bar redime QR → SALIDA automática (DiStock ya existente)
                                                                       │
[Conteo turno] Bartender cierra turno → conteo rápido de su barra → CONTEO + diferencias
                                                                       │
[Cuadre semanal] Encargado sube Excel general → InventoryComparisonModule → ajustes
                                                                       │
                                                                       ▼
                                                  stock_balances (única verdad)
                                                                       │
                                                          Realtime ────┤
                                                                       ▼
                                              Dashboard Gerencia (tiempo real)
```

## Cambios a implementar

### 1. Lector de facturas — cerrar el ciclo

Estado: `parse-invoice` existe pero no aterriza siempre como movimiento.

- Pantalla **"Nueva compra desde factura"** en InventoryHub:
  - Subir foto/PDF → llama `parse-invoice` (Lovable AI, modelo `google/gemini-2.5-pro` para visión).
  - Devuelve líneas: nombre proveedor, items con `nombre, cantidad, formato/ml, costo neto, IVA, ILA`.
  - Matching difuso contra catálogo (ya existe `match-products`); si no hay match el usuario lo enlaza o crea SKU.
  - Botón "Confirmar compra" → inserta `purchases` + `purchase_lines` + `stock_movements` tipo COMPRA en **Bodega Principal**, recalcula CPP por producto (lógica CPP existente, excluye IVA/ILA).
- Auditoría: guardar URL de la imagen de factura en `purchase_documents`.

### 2. Reposición bartender (pre-jornada)

Estado: `BarReplenishment.tsx` ya existe. Mejoras:

- Atajo destacado al iniciar jornada ("Reponer mi barra antes de abrir").
- Vista por bartender filtrada a su(s) ubicación(es).
- Sugerencia automática: por cada producto, mostrar `stock_actual` en barra vs `mínimo` (ya existe `stock_location_minimums`) y precargar la cantidad sugerida.
- Confirmar = `stock_transfers` Bodega → Barra (movimientos ya descuentan/aumentan `stock_balances`).

### 3. Conteo de cierre de turno

- Nueva pantalla **"Conteo de cierre"** disparada al cerrar jornada por bartender, **solo de su barra**.
- Lista los productos con stock > 0 en su ubicación.
- Input rápido por producto (mobile-first, teclado numérico).
- Genera `stock_movements` tipo CONTEO con `quantity = real - teorico` (ajuste).
- Diferencias > umbral (ej. 10%) quedan marcadas y aparecen en alertas para el administrador (no se autoaprueban; se respeta política de waste/aprobación existente para mermas grandes).

### 4. Cuadre semanal

Ya existe `InventoryComparisonModule` con upload de Excel. Solo:
- Marcar visualmente que es el flujo "semanal/general" y agendar recordatorio (alerta cada 7 días desde último cuadre).

### 5. **Panel de Inventario en Tiempo Real (Gerencia)** — pieza nueva clave

Nuevo módulo `RealtimeInventoryDashboard.tsx` accesible desde el sidebar de **gerencia** y **admin**.

Contenido:

- **KPIs arriba** (todos venue-scoped, leídos por RPC agregado):
  - Capital total inmovilizado (∑ `stock_balances.quantity * CPP`)
  - # SKUs con stock
  - # productos bajo mínimo
  - Última actualización (timestamp del último movimiento)
  - Mermas y diferencias de la semana

- **Vista por ubicación** (Bodega + cada Barra):
  - Tabla con Producto, Stock actual, CPP, Valor, Mínimo, Estado (OK / Bajo / Crítico).
  - Filtro por categoría y búsqueda.

- **Stream de movimientos en vivo** (panel lateral):
  - Últimos 20 movimientos del venue: tipo, producto, cantidad, ubicación, usuario, hora.

- **Actualización en tiempo real** sin refrescar:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_balances;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
  ```
  El cliente se suscribe filtrando por `venue_id` y revalida la fila afectada (no recarga todo).

- **RPC nuevo `get_realtime_inventory_snapshot(p_venue_id)`** que devuelve en una sola llamada: balances por ubicación + valor (CPP) + estado vs mínimo. Esto evita N+1 y respeta la regla de paginación de 1000 filas.

### 6. Alertas y trazabilidad

- Reutilizar `stock_alerts` para: stock bajo, diferencia de conteo > umbral, factura pendiente de validar, reposición no realizada antes de abrir jornada.
- Bell de notificaciones de gerencia (módulo `NotificationsManagement` ya existe).

## Detalles técnicos

- **Migraciones**: agregar `stock_balances` y `stock_movements` a `supabase_realtime`; crear RPC `get_realtime_inventory_snapshot`; opcionalmente `last_count_at` por (product, location) para detectar productos sin contar hace mucho.
- **RLS**: ya está. Solo verificar que gerencia pueda `SELECT` sobre `stock_balances`, `stock_movements`, `stock_locations` de su venue (usar `get_user_venue_id()`).
- **Edge functions**: `parse-invoice` pasa a usar Lovable AI (`google/gemini-2.5-pro` para visión, sin pedir API key). Validación con Zod del JSON devuelto.
- **Frontend**:
  - `src/components/dashboard/RealtimeInventoryDashboard.tsx` (nuevo).
  - `src/hooks/useRealtimeInventory.ts` (nuevo, suscripción Realtime + cache local).
  - `src/components/dashboard/InvoiceCaptureDialog.tsx` (nuevo, captura cámara/upload).
  - `src/components/dashboard/EndOfShiftCountDialog.tsx` (nuevo).
  - Sidebar (`AppSidebar.tsx`): nueva entrada "Inventario en vivo" para `admin` y `gerencia`.
- **Branding**: respetar dark theme #000 / #00E676 / SF Pro / radius 0.25rem.
- **CLP**: `Math.round()` en todos los valores monetarios.
- **Timezone**: `America/Santiago` para "última actualización".

## Entregables

1. Migración SQL: realtime publish + RPC snapshot + (opcional) `last_count_at`.
2. Edge function `parse-invoice` consolidada con Lovable AI + Zod.
3. Componentes nuevos: panel realtime, captura de factura, conteo de cierre.
4. Mejoras en `BarReplenishment` (sugerencias por mínimos).
5. Entrada en sidebar para Gerencia/Admin.

## Lo que NO cambia

- DiStock sigue siendo la regla (descuento solo en redemption del bar).
- CPP excluye IVA/ILA.
- Bodega Principal sigue siendo el único punto de intake.
- RLS multi-tenant intacta.

¿Apruebas el plan para que lo implemente?
