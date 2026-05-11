## Objetivo

Dejar el módulo de QR de Cortesía funcionando de punta a punta: generación (Admin/Gerencia) → impresión → canje (Barra HID + POS Híbrido) → registro en `courtesy_redemptions` → conteo visible en informes.

## Diagnóstico actual

Hay 0 filas en `courtesy_redemptions` históricamente, a pesar de que existen QRs creados. Causas detectadas:

1. **Sales.tsx (POS Vendedor)** sí inserta en `courtesy_redemptions` directamente, pero por RLS / lógica del cajero esa inserción puede fallar silenciosamente y deja el QR sin marcar.
2. **Bar.tsx + HybridQRScannerPanel** llaman al RPC `redeem_courtesy_qr` pero éste sólo registra en `courtesy_redemptions` cuando `p_jornada_id IS NOT NULL`. Si el bartender no tiene jornada cargada en `useAppSession`, el canje "funciona" pero no se audita.
3. La UI del bar muestra `🎁 producto x N` pero no marca claramente "CORTESÍA" en pantalla grande, ni el motivo (`note`) ni quién lo creó → la barra no sabe si entregar.
4. La impresión del QR ya usa `window.open + print`, pero el layout es genérico, sin branding ni tamaño 80 mm.
5. No existe descarga de reporte de QRs de cortesía (Admin lo pidió).
6. El **Reporte POS térmico** y el panel de **Reconciliación de canjes** no muestran cantidad de cortesías emitidas / canjeadas en la jornada.

---

## Cambios

### 1. Backend (migración)

- Modificar `redeem_courtesy_qr` para que **siempre** registre el canje en `courtesy_redemptions` (jornada_id puede ser NULL si no hay jornada activa, registrando `result='success'` igual). Agregar columna opcional `pos_source` (`bar`, `hybrid_pos`, `vendedor_pos`) para trazabilidad.
- Mantener seguridad: la función seguirá siendo `SECURITY DEFINER` con el chequeo de roles existente.
- Asegurar que `courtesy_redemptions.jornada_id` permita NULL.

### 2. Canje en Barra (`src/pages/Bar.tsx`)

- Pasar `p_pos_source: 'bar'` en la llamada RPC.
- Cuando `result._courtesy === true`, mostrar un banner grande "🎁 CORTESÍA" arriba del nombre del producto, mostrar nota y motivo si existen, y el contador `usos_restantes`.
- Agregar entry de auditoría con motivo (`note`) en `scanHistory`.

### 3. Canje en POS Híbrido (`src/components/sales/HybridQRScannerPanel.tsx`)

- Pasar `p_pos_source: 'hybrid_pos'` en la llamada RPC.
- Mostrar el mismo banner "CORTESÍA" en el resultado del scanner. Especificar que producto se debe entregar.

### 4. POS Vendedor — bloquear canje directo

- Quitar `CourtesyRedeemDialog` del flujo Vendedor (botón en `Sales.tsx` + bloque que inserta en `courtesy_redemptions`). Las cortesías ahora **sólo** se canjean en Barra/Híbrido (única fuente de verdad), eliminando la ruta que fallaba silenciosamente.
- Mantener `isCourtesy` en cart sólo para el caso interno (no se ofrece UI para usarlo).

### 5. Generación Admin (`src/pages/CourtesyQR.tsx`)

- Vista compartida con Gerencia (ya lo es). Para Admin (detectar por `role === 'admin'`):
  - Botón **"Descargar reporte"** en el header → genera CSV con: código, producto, qty, max_uses, used_count, status, note, created_by_name, created_at, expires_at, redemptions (fecha, jornada, resultado).
  - Filtro extra por rango de fechas.
- Mejorar diálogo "Ver QR":
  - Layout de impresión 80 mm: logo Stockia, nombre producto grande, qty, código, motivo, "VÁLIDO HASTA", footer "Canjear en barra".
  - `window.print()` con CSS `@media print { @page { size: 80mm auto; } }`.

### 6. Informe POS Térmico (`src/lib/printing/pos-sales-report.ts`)

- Agregar al final una sección **"Cortesías"**:
  - Cortesías emitidas en la jornada (cuenta de `courtesy_qr` creadas en jornada activa).
  - Cortesías canjeadas en la jornada (cuenta de `courtesy_redemptions` con `result='success'`).
  - Listado breve: producto × qty (top 5).

### 7. Reconciliación de canjes (`RedeemReconciliationPanel.tsx`)

- Ya muestra `courtesyCount`. Agregar también:
  - Cortesías **emitidas** en la jornada (no sólo canjeadas).
  - Detalle por producto.
- Incluir esos datos en el CSV exportable.

### 8. Memoria

Actualizar `mem://features/sales/courtesy-qr-system` con: canje sólo Barra+Híbrido vía RPC, registro siempre auditado, `pos_source` para trazar origen.

---

## Detalles técnicos

```text
Flujo de canje único
────────────────────
Admin/Gerencia ──▶ courtesy_qr (insert)
                    │
                    ▼
            Imprime QR (80 mm)
                    │
                    ▼
   Cliente ──▶ Barra HID  ─┐
   Cliente ──▶ POS Híbrido ┴─▶ RPC redeem_courtesy_qr
                                  │
                                  ▼
                       courtesy_qr.used_count++
                       courtesy_redemptions (insert)
                                  │
                                  ▼
                       Banner "🎁 CORTESÍA"
```

```sql
-- Migración resumida
ALTER TABLE courtesy_redemptions ADD COLUMN IF NOT EXISTS pos_source text;
ALTER TABLE courtesy_redemptions ALTER COLUMN jornada_id DROP NOT NULL;
-- redeem_courtesy_qr: agregar p_pos_source text, INSERT siempre.
```

## Archivos a tocar

- `supabase/migrations/<new>.sql`
- `src/pages/CourtesyQR.tsx`
- `src/pages/CourtesyQRSimple.tsx` (alinear impresión 80 mm)
- `src/pages/Bar.tsx`
- `src/components/sales/HybridQRScannerPanel.tsx`
- `src/pages/Sales.tsx` (quitar diálogo cortesía)
- `src/lib/printing/pos-sales-report.ts`
- `src/components/dashboard/RedeemReconciliationPanel.tsx`
- `mem://features/sales/courtesy-qr-system`

## Fuera de alcance

- No se toca el cálculo de COGS / DiStock (sigue deduciendo en barra como hoy).
- No se agrega cortesía al PDF cajero ni al Excel mensual.