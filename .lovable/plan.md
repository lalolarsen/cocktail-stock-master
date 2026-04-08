

# Plan: Reimprimir comprobante, mejorar detalle en tickets, y fix multi-producto en redeem

## 3 problemas a resolver

1. **Reprint comprobante en recientes**: Hoy solo hay botón "QR" para reimprimir. Falta botón para reimprimir comprobante cajero.

2. **Detalle de compra más grande y legible**: Tanto el QR ticket (`buildQrOnlyHtml`) como el comprobante (`buildCashierReceiptHtml`) y el `PickupQRDialog` (print popup) muestran los items en tamaño muy pequeño (11pt). Necesitan ser más grandes y marcados para impresoras térmicas.

3. **Bug multi-producto en redeem**: En `Bar.tsx` línea 96-98, la función `getDelivery()` cuando hay múltiples items distintos retorna solo el nombre del primer producto con la cantidad total sumada. Ejemplo: 1x Mistral + 1x Aperol → muestra "Mistral ×2". El desglose detallado sí existe (línea 765-772) pero el header principal (líneas 762-763) muestra info incorrecta.

---

## Cambios

### 1. Botón reimprimir comprobante en `Sales.tsx`

En la sección de "Recientes" (línea ~1348), junto al botón QR existente, agregar un segundo botón "Comprobante" que:
- Recupere los items de la venta (ya están en `sale.sale_items`)
- Construya un `ReceiptData` con la info de la venta
- Llame a `printOneDocument(buildCashierReceiptHtml(...), buildCashierReceiptCss(...))`
- Exportar `buildCashierReceiptHtml` y `buildCashierReceiptCss` desde `qz.ts` (hoy son funciones internas)

### 2. Mejorar legibilidad del detalle en impresiones

**`src/lib/printing/qz.ts`**:
- En `buildQrOnlyHtml`: agregar sección de items con fuente grande (14pt bold) antes del QR
- En `buildCashierReceiptHtml`: subir `.item-line` de 11pt a 14pt bold
- En `buildReceiptCss`: subir `.item-name` y `.item-price` de 11pt a 14pt

**`src/components/PickupQRDialog.tsx`**:
- En el HTML de impresión: subir `.item` de 11px a 14pt bold
- En la vista en pantalla: subir items de `text-sm` a `text-base font-semibold`

### 3. Fix `getDelivery()` en `Bar.tsx`

Cambiar la función `getDelivery` (línea 93-100):
- Cuando hay múltiples items, en vez de retornar solo el nombre del primero con cantidad total, retornar un nombre descriptivo como "2 productos" y la cantidad total
- El desglose detallado ya se muestra en las líneas 765-772, así que el header solo necesita ser correcto

**Cambio concreto** en línea 98:
```
// Antes:
return { name: deliver.items[0].name, quantity: deliver.items.reduce((s, i) => s + i.quantity, 0) };

// Después:  
return { name: `${deliver.items.length} productos`, quantity: deliver.items.reduce((s, i) => s + i.quantity, 0) };
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/printing/qz.ts` | Exportar builders, agrandar fuente de items en los 3 templates |
| `src/pages/Sales.tsx` | Agregar botón reimprimir comprobante en recientes |
| `src/components/PickupQRDialog.tsx` | Agrandar items en print HTML y en pantalla |
| `src/pages/Bar.tsx` | Fix `getDelivery()` para multi-producto |

## Lo que NO se toca

- Lógica de ventas, redeem, stock
- DB / schema
- Flujo de impresión automática post-venta
- `useAutoPrintReceipt`

