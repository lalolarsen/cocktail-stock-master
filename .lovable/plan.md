

## Diagnóstico

Cuando se escanea un QR de cortesía en la **Caja Híbrida** (`HybridQRScannerPanel`) o en el **Bar** (`Bar.tsx`), el código entra al "Courtesy QR bypass" y muestra de forma hardcodeada:

```ts
deliver: { type: "cover", name: "Cortesía", quantity: 1 }
```

Por eso el operador nunca ve **qué producto** ni **qué cantidad** se está canjeando. Además:

1. **No se consulta `courtesy_qr`**, por lo que no se valida el código contra la BD (un QR cancelado, expirado o ya canjeado pasaría como válido).
2. **No se decrementa `used_count` ni se actualiza `status`**, así que el mismo QR puede usarse infinitas veces.
3. **No se inserta nada en `courtesy_redemptions`**, por lo que:
   - El KPI de "QRs Canjeados" del dashboard no los cuenta.
   - El módulo de Reconciliación (`RedeemReconciliationPanel`) y Comparación de Inventario (`InventoryComparisonModule`) no detectan el consumo.
   - La lógica de COGS de cortesía en `useFinanceMTD` no los descuenta.

Lo curioso: ya existe en BD un RPC **`redeem_courtesy_qr(p_code, p_jornada_id)`** (SECURITY DEFINER) que hace **todo** correctamente — valida, decrementa, registra en `courtesy_redemptions` y devuelve `{ deliver: { name: "🎁 <product>", quantity: <qty> }, courtesy: { code, product_name, qty, used_count, max_uses, status } }`. Simplemente no se está llamando.

## Plan de corrección

### A. Reemplazar el bypass por la RPC oficial

**`src/pages/Bar.tsx`** (líneas ~341-354) y **`src/components/sales/HybridQRScannerPanel.tsx`** (líneas ~121-134):

Sustituir el atajo hardcodeado por:

```ts
if (token.startsWith("courtesy:")) {
  const code = token.slice("courtesy:".length);
  const { data, error } = await supabase.rpc("redeem_courtesy_qr", {
    p_code: code,
    p_jornada_id: activeJornadaId ?? null,
  });
  // tratar respuesta como un RedemptionResult normal
}
```

Mapear los `error_code` retornados (`TOKEN_NOT_FOUND`, `TOKEN_EXPIRED`, `TOKEN_CANCELLED`, `ALREADY_REDEEMED`, `FORBIDDEN`, `UNAUTHENTICATED`) a los mismos estados visuales que ya maneja el panel para QRs normales (badges YA CANJEADO / EXPIRADO / INVÁLIDO).

En el caso de éxito, el `deliver` viene ya con `name: "🎁 <product>"` y `quantity: <qty>`, por lo que la UI (que ya sabe renderizar `deliver.name × deliver.quantity`) mostrará automáticamente el producto correcto.

### B. Histórico y feedback visual
- En `setScanHistory` reemplazar la etiqueta fija `"ENTREGAR: Cortesía"` por la del producto real (`historyLabel(r)` ya lo construye desde `deliver`).
- Marcar el flag `_courtesy: true` cuando `r.courtesy` esté presente, para conservar el badge dorado actual.

### C. Pasar `activeJornadaId`
- En `Bar.tsx` ya se usa `useAppSession`; añadir `activeJornadaId` a la llamada.
- En `HybridQRScannerPanel` agregar la prop `activeJornadaId` (ya está disponible en `Sales.tsx`, pasarla por props) y enviarla al RPC.

### D. Limpieza secundaria
- Mantener `CourtesyRedeemDialog.tsx` (entrada manual desde `Sales.tsx`) sin cambios — sigue funcionando para el flujo de "agregar al carrito" (no es el flujo de Bar).

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/pages/Bar.tsx` | Reemplazar bypass por `supabase.rpc("redeem_courtesy_qr", ...)` con `activeJornadaId` |
| `src/components/sales/HybridQRScannerPanel.tsx` | Mismo reemplazo + nueva prop `activeJornadaId` |
| `src/pages/Sales.tsx` | Pasar `activeJornadaId` al `HybridQRScannerPanel` |

## Memoria a actualizar

`mem://features/sales/courtesy-qr-system` y `mem://architecture/courtesy-redemption-rls-bypass`: dejar explícito que **el canje de cortesía en Bar e Hybrid POS debe pasar SIEMPRE por el RPC `redeem_courtesy_qr`**, no por bypass cliente. El RPC es la fuente única que valida, decrementa `used_count` y registra `courtesy_redemptions` (requerido para KPIs, reconciliación y COGS).

