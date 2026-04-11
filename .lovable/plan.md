

# Plan: Fix QR cortesía no reconocido por scanner híbrido

## Diagnóstico

El QR de cortesía genera el valor `COURTESY:2b9ecb2df26d`. El parser `parseQRToken` tiene la lógica correcta para el prefijo `COURTESY:`, PERO hay dos problemas potenciales:

1. **Teclado HID y colon (`:`)**: Los scanners Bluetooth en modo HID envían teclas según layout US. Si el sistema operativo tiene layout español, el `:` puede llegar como otro carácter (ej. `Ñ`, `.`, etc.), haciendo que el prefijo `COURTESY:` no se reconozca.

2. **Si el prefijo falla, el fallback hex SÍ debería capturar** el código `2b9ecb2df26d` (12 chars hex) y tratarlo como pickup token → RPC falla → bypass lo marca como éxito. PERO si el scanner envía caracteres extra o el prefijo se concatena sin separador legible, el regex puede no encontrar 12+ hex chars contiguos.

## Solución

### `src/lib/qr.ts` — Parser más robusto

- Aceptar `COURTESY` sin colon (o con cualquier separador): usar regex `/^COURTESY[:\-\s]?(.+)$/i`
- Bajar el mínimo de hex en el fallback de 12 a 8 chars para capturar códigos más cortos
- Agregar `console.log` temporal del raw input para debugging en producción

### `src/components/sales/HybridQRScannerPanel.tsx` — Log del scan raw

- Agregar `console.log("[HybridQR] raw scan:", raw)` antes de parsear, para que si sigue fallando se pueda ver qué llega exactamente del scanner

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/qr.ts` | Regex más flexible para COURTESY, bajar mínimo hex a 8 |
| `src/components/sales/HybridQRScannerPanel.tsx` | Log del raw scan para debugging |

