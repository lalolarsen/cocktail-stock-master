

# Plan: Cortesías — Fix lectura, buscador móvil y COGS en análisis

## 3 problemas a resolver

1. **QR cortesía no funciona en lectura**: El `CourtesyRedeemDialog` valida el QR pero no actualiza `used_count` ni registra la redención al momento del canje. Solo agrega al carrito — la redención real ocurre en `handleConfirmSale`. Sin embargo, el problema de "lectura" puede estar en que el scanner/input no procesa correctamente el prefijo `COURTESY:` o en que QRs activos están expirados. Revisar y corregir el flujo de validación para que funcione correctamente con scanner físico y entrada manual.

2. **Buscador de producto en `CourtesyQRSimple`**: El selector `<Select>` actual no tiene búsqueda — con muchos cocktails es difícil encontrar el producto. Agregar un input de búsqueda filtrable dentro del diálogo de creación.

3. **COGS de cortesía en AnalyticsPanel**: Actualmente `AnalyticsPanel` no muestra nada sobre cortesías. Agregar una sección que detalle el COGS generado por cortesías con el motivo (`note`) de cada QR.

---

## Cambios

### 1. Fix lectura QR — `CourtesyRedeemDialog.tsx`

- El código actual hace `code.trim().replace(/^COURTESY:/i, "")` — esto es correcto
- El problema probable: el scanner envía el código con Enter y el `handleKeyDown` llama `validate()` pero si el código incluye mayúsculas/minúsculas mixtas o espacios del scanner, puede fallar el match
- **Fix**: Normalizar el código a lowercase antes del query (el campo `code` en DB es lowercase hex)
- Agregar log de error más claro cuando `venue_id` no coincide

### 2. Buscador en `CourtesyQRSimple.tsx`

- Reemplazar el `<Select>` de producto por un listado filtrable con `<Input>` de búsqueda
- Mostrar los cocktails filtrados como botones/cards tocables (mejor UX móvil que un dropdown)
- Al seleccionar, se marca el producto y se continúa con el flujo normal

### 3. COGS de cortesía en `AnalyticsPanel.tsx`

- Agregar fetch de `courtesy_qr` con estado `redeemed` para el mes seleccionado
- Calcular COGS por cada cortesía usando la misma lógica de recetas (cocktail_ingredients × CPP)
- Mostrar nueva Card/sección:
  - Total COGS cortesías del mes
  - Tabla con: producto, qty, motivo (note), COGS estimado
- Agrupar por motivo (socio/RRHH) si hay `note`

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/sales/CourtesyRedeemDialog.tsx` | Normalizar código, mejorar manejo de errores |
| `src/pages/CourtesyQRSimple.tsx` | Agregar buscador filtrable en diálogo de creación |
| `src/components/dashboard/AnalyticsPanel.tsx` | Nueva sección COGS cortesías con detalle por motivo |

## Lo que NO se toca

- Lógica de ventas en `Sales.tsx`
- DB / schema
- Flujo de redención (ya funciona al confirmar venta)
- `CourtesyQR.tsx` (versión admin — ya tiene búsqueda)

