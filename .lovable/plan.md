

# Plan: Separar impresión QR y comprobante cajero

## Situación actual

Hoy `printRaw` imprime un solo documento HTML que mezcla QR + comprobante. Se usa `print-js` con `--kiosk-printing` (sin diálogo). Funciona bien.

## Lógica requerida

- **Caja normal** (tiene `pickupToken`): imprimir QR solo, luego imprimir comprobante solo
- **Caja híbrida** (auto-canje, sin QR para cliente): imprimir solo comprobante

## Cambios

### 1. `src/lib/printing/qz.ts` — Agregar builders separados

Agregar dos funciones HTML builder nuevas (reutilizando CSS existente):

- **`buildQrOnlyHtml(data, paperWidth)`** — Solo venue, venta, QR, short code, instrucción. Sin items ni total.
- **`buildCashierReceiptHtml(data, paperWidth)`** — Solo venue, caja, venta, fecha, items (formato `1x Mistral $2.000`), pago, total. Sin QR.

Agregar una función coordinadora:

- **`printSaleDocuments(printerName, data, paperWidth, isHybrid)`**
  - Si `isHybrid` o no hay `pickupToken`: imprime solo comprobante
  - Si caja normal con `pickupToken`: imprime QR, espera 1.5s, imprime comprobante

La función `buildReceiptHtml` y `printRaw` existentes no se tocan (se mantienen por compatibilidad con PrintingPanel test print y reprint).

### 2. `src/hooks/useAutoPrintReceipt.ts` — Usar nueva función

En `autoPrintReceipt`, reemplazar la llamada a `printRaw` por `printSaleDocuments`, pasando el parámetro `isHybrid`.

Agregar `isHybrid` como parámetro opcional de `autoPrintReceipt(data, saleId, pickupTokenId, isHybrid)`.

### 3. `src/pages/Sales.tsx` — Pasar `isHybrid`

En la llamada a `autoPrintReceipt` (línea ~657), agregar el flag `isHybridPOS` que ya existe en scope.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/printing/qz.ts` | +2 builders HTML, +1 función `printSaleDocuments` |
| `src/hooks/useAutoPrintReceipt.ts` | Pasar `isHybrid`, usar `printSaleDocuments` |
| `src/pages/Sales.tsx` | Agregar `isHybridPOS` a la llamada |

No se crean archivos nuevos. No se toca DB. No se toca UI.

