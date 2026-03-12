

# Plan: Código corto numérico para ingreso manual de QR

## Contexto

Actualmente el token de pickup es un hex de 16 caracteres (ej: `a3f8b2c1d4e5f607`). Esto es demasiado largo para dictarlo o teclearlo manualmente. Necesitamos un **código numérico corto** (4-6 dígitos) que se imprima de forma prominente en la boleta y que el operador pueda ingresar rápidamente.

## Diseño

### 1. Columna `short_code` en `pickup_tokens`

- Agregar columna `short_code TEXT` con default que genere un número de **6 dígitos** aleatorio: `lpad(floor(random()*1000000)::text, 6, '0')`
- Índice parcial UNIQUE: `UNIQUE (venue_id, short_code) WHERE status = 'issued'` — así los códigos se reciclan cuando el token se canjea o expira, reduciendo colisiones
- 6 dígitos = 1 millón de combinaciones, más que suficiente para tokens activos simultáneamente en un venue

### 2. RPC: Buscar por `short_code`

- Modificar `redeem_pickup_token` para que acepte tanto el token hex completo como un short_code numérico de 6 dígitos
- Lógica: si `p_token` matchea `^\d{6}$`, buscar por `short_code` + `venue_id` (del bartender) en vez de por `token`
- Esto evita crear un RPC separado

### 3. Boleta impresa — mostrar código grande

- En `buildReceiptHtml` (`src/lib/printing/qz.ts`): agregar el `short_code` debajo del QR con estilo prominente (font-size 18pt, bold, espaciado entre dígitos)
- Texto: `CÓDIGO: 1 2 3 4 5 6`
- Agregar `shortCode` al interface `ReceiptData`

### 4. Pasar `short_code` al momento de imprimir

- Donde se genera la venta y se crea el pickup token, obtener el `short_code` devuelto por el INSERT y pasarlo a `ReceiptData.shortCode`

### 5. UI: Ingreso manual en `HybridQRScannerPanel`

- Agregar botón "Ingreso manual" con dialog
- Input numérico de 6 dígitos (usar `input-otp` o input simple con `maxLength=6`, `inputMode="numeric"`)
- Al submit: llamar `processToken` con el código de 6 dígitos directamente (el RPC ya lo manejará)
- Actualizar `parseQRToken` para reconocer códigos de 6 dígitos como válidos

## Archivos a modificar

1. **Migración SQL** — agregar columna `short_code`, índice, y actualizar RPC
2. **`src/lib/printing/qz.ts`** — agregar `shortCode` a `ReceiptData`, mostrarlo prominente en boleta
3. **`src/lib/qr.ts`** — extender `parseQRToken` para aceptar 6 dígitos numéricos
4. **`src/components/sales/HybridQRScannerPanel.tsx`** — agregar dialog de ingreso manual
5. **Archivos que crean pickup tokens** — pasar `short_code` a receipt data

