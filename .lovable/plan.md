

# Plan: Limpiar QZ Tray + Acceso bartenders a cajas híbridas

## 1. Corregir build errors — reescribir `src/lib/qz-tray.ts`
Nadie importa este archivo (búsqueda confirmó 0 imports externos). Reescribirlo con stubs no-op para todas las funciones que ya no existen en `src/lib/printing/qz.ts`:
- `initQz`, `ensureQz`, `connectQz`, `disconnectQz`, `findPrinters`, `findPrinter`, `getDefaultPrinter`, `forceHandshake`, `invalidatePrinterCache`, `getQZDiagnostics` → funciones no-op
- Re-exportar solo lo que sí existe: `isQZConnected`, `getPreferredPrinterStorageKey`, `getPreferredPaperWidthStorageKey`, `printRaw`, `ReceiptData`, `PaperWidth`

## 2. Limpiar `PrintingPanel.tsx` — eliminar todo lo de QZ/Kiosco
- Eliminar constantes `KIOSK_CMD_*`
- Eliminar estado `kioskSectionOpen` y toda la sección de "Modo Kiosco" (líneas 142-228)
- Eliminar imports no usados: `Copy`, `Monitor`
- Dejar solo: selector de ancho de papel + botón de impresión de prueba

## 3. Dar acceso al rol `bar` a `/sales`
En `src/App.tsx` línea 187, cambiar:
```
allowedRoles={["vendedor", "admin"]}
```
a:
```
allowedRoles={["vendedor", "admin", "bar"]}
```

## 4. Limpiar comentarios QZ en `useAutoPrintReceipt.ts`
Eliminar las referencias a "QZ Tray removed" en los comentarios del hook.

## Archivos a modificar
| Archivo | Cambio |
|---|---|
| `src/lib/qz-tray.ts` | Reescribir con stubs no-op |
| `src/components/sales/PrintingPanel.tsx` | Eliminar sección kiosco y refs QZ |
| `src/App.tsx` | Agregar `"bar"` a allowedRoles de `/sales` |
| `src/hooks/useAutoPrintReceipt.ts` | Limpiar comentarios |

