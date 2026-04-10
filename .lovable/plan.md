

# Plan: Solución momentánea — Todos los QR aparecen como redeem + soporte cortesía

## Problema

1. **QR cortesía no se reconoce en barra**: `parseQRToken()` solo maneja prefijo `PICKUP:`, URLs y hex puro. Los QR de cortesía usan `COURTESY:<code>` — el parser los rechaza como inválidos.

2. **Errores de redeem bloquean la operación**: Cuando el RPC `redeem_pickup_token` falla (stock, token no encontrado, etc.), el bartender ve un error y no puede despachar. Se necesita que **siempre** muestre "ENTREGAR" como solución temporal.

## Cambios

### 1. `src/lib/qr.ts` — Reconocer prefijo `COURTESY:`

Agregar manejo del prefijo `COURTESY:` para que el parser lo acepte como token válido. Retornar el código con un prefijo interno `courtesy:` para diferenciarlo.

### 2. `src/pages/Bar.tsx` — Fallback a "success" en errores

En `redeemToken()` y `processToken()`: si el RPC falla o retorna error, en vez de mostrar error, mostrar estado "success" con un mensaje genérico "Entregar pedido". Agregar un badge visual sutil (ej. "⚠ sin confirmar") para que quede registro de que no se validó en DB, pero el bartender pueda despachar.

Para QR de cortesía (token con prefijo `courtesy:`): no llamar al RPC `redeem_pickup_token` (que no los conoce). Mostrar directamente como "ENTREGAR — Cortesía" con estado success.

### 3. `src/components/sales/HybridQRScannerPanel.tsx` — Mismo fallback

Aplicar la misma lógica: si el RPC falla, mostrar "ENTREGAR" en vez de error. Para tokens `courtesy:`, mostrar directamente como éxito.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/qr.ts` | Agregar manejo `COURTESY:` prefix |
| `src/pages/Bar.tsx` | Fallback a success en errores + bypass para cortesía |
| `src/components/sales/HybridQRScannerPanel.tsx` | Mismo fallback + bypass cortesía |

## Lo que NO se toca

- DB / schema / RPC `redeem_pickup_token`
- Flujo de ventas, CourtesyRedeemDialog (caja)
- Lógica de botellas abiertas
- Impresión

