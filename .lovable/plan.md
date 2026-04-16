

# Plan: Tickets POS modernizado con cover multi-opción + impresión + analytics

## Modelo confirmado: Opción B + QRs unificados
Cada tipo de entrada define una **lista de cocktails permitidos como cover**. Al vender, el cajero elige cuál cover por cada entrada con cover. Si solo hay 1 opción permitida, se asigna automáticamente.

**QRs idénticos a venta normal**: los tokens generados (entrada y cover) usan exactamente la misma estructura de `pickup_tokens` que las ventas POS normales — mismo formato `PICKUP:<token>`, mismo short_code de 6 dígitos, mismo pipeline de redeem en `/bar` (HID scanner + parseQRToken). Sin lógica de canje paralela.

## Compatibilidad con redeem existente

- **Entradas**: token con `metadata.kind = 'ticket'`, redimible en bar igual que cualquier QR (deduce stock teórico vía recipe del ticket si aplica, o solo valida acceso).
- **Covers**: token con `metadata.kind = 'cover'` y `cover_cocktail_id` asignado, redimible en bar como cocktail normal — descuenta ingredientes de receta vía mismo flujo `redeem-token`/RPC actual.
- Mismo formato de short_code (6 dígitos), misma generación QR (`generateQRSvgString`), mismo parseo (`parseQRToken`).
- Cero cambios en `/bar`, `Bar.tsx` ni en RPCs de redeem. La RPC `create_ticket_sale_with_covers` solo inserta filas en `pickup_tokens` con la misma forma que `create_sale_with_tokens`.

## Impresión (3 piezas por venta)

Secuencial vía `print-js` (estándar actual), 80mm:

1. **Comprobante de venta** — recibo con items, totales, medio de pago, jornada.
2. **Entrada(s)** — 1 ticket por unidad: QR (`PICKUP:<token>`) + nombre tipo + correlativo "1/N" + short_code.
3. **Cover(s)** — 1 ticket por cover: QR + nombre cocktail asignado + short_code.

Orden: comprobante → entradas → covers, con delays entre piezas (igual que `printSaleDocuments` actual).

## Cambios

### 1. Migración SQL
- Tabla `ticket_type_cover_options` (`ticket_type_id`, `cocktail_id`, `display_order`, unique).
- Migrar `ticket_types.cover_cocktail_id` actual como primera opción de cada tipo.
- Actualizar RPC `create_ticket_sale_with_covers` para aceptar `cover_selections JSONB` y generar tokens con la **misma estructura que ventas POS normales** (mismo `metadata`, `short_code`, formato).

### 2. Catálogo (`TicketTypesManagement.tsx`)
- Multi-select de cocktails permitidos como cover (mín. 1 si `includes_cover=true`).
- Badge "Cover: N opciones".

### 3. Caja Tickets (`Tickets.tsx`)
- Alinear con caja moderna: medio de pago obligatorio sin preselección, reset post-venta, layout consistente.
- `CartItem.coverSelections: string[]` — cocktail_id por cover.
- Selector inline al agregar entrada con cover (auto-asigna si solo 1 opción).
- "Cobrar" deshabilitado si hay covers pendientes.
- Auto-print 3 piezas post-venta.

### 4. Impresión (`src/lib/printing/ticket-print.ts` nuevo)
- `printTicketSale(saleData, tokens, paperWidth)` reutilizando templates de `qz.ts` y `generateQRSvgString`.
- Templates entrada/cover idénticos en formato QR a los de ventas normales.

### 5. Reimpresión (`TicketReceiptDialog.tsx`)
- Botón reimpresión que dispara las 3 piezas otra vez.

### 6. Analytics (`AnalyticsPanel.tsx`)
- Nueva sección **"Tickets"**:
  - KPIs: entradas vendidas (mes), ingresos por tickets, ticket promedio, % covers redimidos.
  - Gráfico ventas diarias 12 meses.
  - Ranking tipos de entrada (unidades + ingresos).
  - Breakdown covers más asignados/redimidos.
- Fuente: `ticket_sales`, `ticket_sale_items`, `pickup_tokens` (filtrado por `metadata.kind`).

### 7. Memoria
- Nueva: `mem://features/tickets/cover-multi-option-and-printing` — modelo B + QRs unificados con redeem normal + impresión 3 piezas.
- Actualizar `mem://features/analytics/monthly-data-insights` con sección Tickets.

## Archivos

| Archivo | Cambio |
|---|---|
| Migración SQL | `ticket_type_cover_options` + RPC con tokens estándar |
| `src/components/dashboard/TicketTypesManagement.tsx` | Multi-select covers |
| `src/pages/Tickets.tsx` | Caja moderna + selector cover + auto-print |
| `src/components/tickets/TicketReceiptDialog.tsx` | Reimpresión 3 piezas |
| `src/lib/printing/ticket-print.ts` (nuevo) | `printTicketSale` con QRs estándar |
| `src/components/dashboard/AnalyticsPanel.tsx` | Sección Tickets |
| Memoria | Documentar |

