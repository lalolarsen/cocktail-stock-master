# Imprimir QR "ya canjeado" en POS Híbrido

## Objetivo
En la barra híbrida, además del comprobante del cajero, imprimir un segundo ticket con el QR del pedido marcado visualmente como **CANJEADO**, para que el bartender lo pinche en el spike de conteo.

Hoy `printSaleDocuments` omite el QR cuando `isHybrid = true`. La venta sí genera `pickupToken`, así que solo falta imprimirlo con un layout distinto.

## Cambios

### 1. `src/lib/printing/qz.ts`
- Nueva variante `buildQrOnlyHtml(data, paperWidth, { redeemed: boolean })`:
  - Mantiene venue, número de venta, items y QR.
  - Si `redeemed`:
    - Reemplaza la etiqueta "QR DE RETIRO" por **"QR CANJEADO — PINCHAR"**.
    - Agrega un sello tipo `CANJEADO ✓` (borde grueso, texto grande) sobre la sección.
    - Sustituye la instrucción "Presenta este QR en la barra" por **"Ya descontado del stock · Para conteo en caja"**.
    - Marca de agua diagonal opcional con `transform: rotate(-20deg)` y opacidad sobre el QR (sin tapar el módulo, solo decorativa) — o más simple: borde y banda superior. Mantengo el QR legible/escaneable por si se reescanea.
- En `printSaleDocuments`:
  - Eliminar la condición `!isHybrid` para imprimir QR.
  - Si `isHybrid`, llamar al builder con `{ redeemed: true }`; si no, comportamiento actual `{ redeemed: false }`.

### 2. `src/hooks/useAutoPrintReceipt.ts`
- No requiere cambios de API: ya pasa `isHybrid` a `printSaleDocuments`. La nueva lógica de "QR canjeado" se activa internamente con esa misma flag.

### 3. Sin cambios de backend
- No se toca lógica de stock, RPC ni RLS. La venta híbrida ya hace `auto_redeem_sale_token`, así que el QR impreso refleja un canje real.
- El QR impreso seguirá siendo un token válido, pero al estar ya canjeado, un reescaneo retornará `ALREADY_REDEEMED` (comportamiento existente y deseado).

## Fuera de alcance
- Diseño de un QR distinto / no escaneable (no necesario; el flujo ya bloquea doble canje).
- Cambios en el wizard `HybridPostSaleWizard` (la impresión la dispara `useAutoPrintReceipt` desde el flujo de venta, no el wizard).
