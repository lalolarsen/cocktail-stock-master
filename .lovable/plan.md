

# Plan: Mejorar legibilidad de tickets para impresoras térmicas

## Problema
Los QR y detalles del ticket son difíciles de leer en impresoras térmicas de baja calidad. Falta espacio inferior al cortar el papel.

## Cambios en `src/lib/printing/qz.ts`

### 1. Agrandar QR
- QR size: 80mm → **280px** (de 220), 58mm → **220px** (de 180)

### 2. Agrandar tipografía de detalles
- `.meta` (venta #, fecha): **11pt** (de 9pt)
- `.items td` (productos): **11pt** (de 9.5pt)
- `.item-price`: **11pt**
- `.total-line`: **15pt** (de 13pt)
- `.payment`: **11pt** (de 9.5pt)
- `.qr-label` ("QR DE RETIRO"): **13pt** (de 10pt)
- `.qr-instruction`: **10pt** (de 9pt)
- `.short-code`: **22pt** (de 18pt)
- `.short-code-label`: **11pt** (de 9pt)
- `.footer`: **11pt** (de 9.5pt)

### 3. Espacio inferior para corte limpio
- Añadir `padding-bottom: 40mm` al `.receipt` para que la impresora avance papel suficiente antes del corte
- Alternativamente, añadir un div spacer al final del HTML: `<div style="height:40mm"></div>`

### Archivo a modificar
| Archivo | Cambio |
|---|---|
| `src/lib/printing/qz.ts` | Ajustar CSS sizes + QR size + spacer bottom |

