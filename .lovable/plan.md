

# Plan: Auto-print comprobante en híbrida + fix QR cortesía en híbrida y bar

## 2 problemas

### 1. Courtesy QRs no reconocidos en híbrida ni bar
`parseQRToken()` en `src/lib/qr.ts` solo maneja prefijos `PICKUP:`, `token=`, `/r/` y hex crudo. Los QR de cortesía tienen formato `COURTESY:{code}` — el parser no lo reconoce y retorna `valid: false`.

Tanto `Bar.tsx` (línea 554) como `HybridQRScannerPanel.tsx` (línea 175) usan `parseQRToken` → si falla, muestran "QR inválido" / ignoran el scan.

Además, incluso si el token se parseara, ambos llaman `redeem_pickup_token` RPC que busca en `pickup_tokens` — los QR cortesía están en `courtesy_qr`, otra tabla.

**Fix**: Extender `parseQRToken` para retornar un `type` ('pickup' | 'courtesy'). En Bar y Hybrid, cuando `type === 'courtesy'`, hacer la validación/redención directamente contra `courtesy_qr` en vez de `redeem_pickup_token`.

### 2. Hybrid POS no imprime comprobante cajero automáticamente
El flujo actual en `Sales.tsx` línea 697-699 requiere `auto_print_enabled || savedPrinter` para auto-imprimir. En híbrida con auto-redeem, el comprobante cajero debería imprimirse siempre.

Además, `printSaleDocuments` ya imprime el comprobante para hybrid (línea 317-319 de qz.ts), pero la condición en Sales.tsx puede no activarse si no hay printer configurado.

**Fix**: Para hybrid POS, forzar auto-print del comprobante cajero usando `printOneDocument` directamente (sin depender de `shouldAutoPrint`).

---

## Cambios

### `src/lib/qr.ts`
- Cambiar return type a `{ valid: boolean; token: string; type: 'pickup' | 'courtesy' }`
- Agregar detección de `COURTESY:` prefix → `type: 'courtesy'`
- Todos los demás casos → `type: 'pickup'`

### `src/components/sales/HybridQRScannerPanel.tsx`
- Importar supabase para query a `courtesy_qr`
- Cuando `parseQRToken` retorna `type === 'courtesy'`:
  - Hacer query a `courtesy_qr` por code + venue
  - Validar status, expiración, uses
  - Actualizar `used_count` y status
  - Mostrar resultado (entregar producto) en la misma UI de success/error
- Cuando `type === 'pickup'`: flujo actual sin cambios

### `src/pages/Bar.tsx`
- Misma lógica: detectar `type === 'courtesy'` del parser
- Hacer redención contra `courtesy_qr` directamente
- Mostrar nombre del producto y cantidad a entregar
- Registrar en `courtesy_redemptions`

### `src/pages/Sales.tsx`
- Después del bloque de auto-print existente (línea ~729), agregar fallback para hybrid POS:
  - Si `isHybridPOS` y no se activó `shouldAutoPrint`, forzar impresión del comprobante cajero vía `printOneDocument(buildCashierReceiptHtml(...), buildCashierReceiptCss(...))`
  - Esto garantiza que siempre se imprima en híbrida

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/qr.ts` | Agregar type 'courtesy', detectar `COURTESY:` prefix |
| `src/components/sales/HybridQRScannerPanel.tsx` | Manejar courtesy tokens con query directa |
| `src/pages/Bar.tsx` | Manejar courtesy tokens con query directa |
| `src/pages/Sales.tsx` | Forzar auto-print comprobante en hybrid POS |

## Lo que NO se toca
- `printSaleDocuments`, `buildCashierReceiptHtml` — ya funcionan
- DB / schema
- `CourtesyRedeemDialog` — sigue igual para caja normal
- Lógica de ventas, stock, recetas

