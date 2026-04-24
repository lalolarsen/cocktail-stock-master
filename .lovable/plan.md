

# Acelerar aprobación de Conteos (350+ filas)

## Diagnóstico

`applyConteos` en `InventoryHub.tsx` (líneas 440-468) procesa cada fila secuencialmente con **5 round-trips por fila**:

1. SELECT `stock_balances` (saldo actual)
2. UPDATE / INSERT `stock_balances`
3. INSERT `stock_movements`
4. SELECT todos los `stock_balances` del producto (para sumar)
5. UPDATE `products.current_stock`

Para 350 filas → **~1.750 viajes secuenciales al servidor**. A 80-150ms cada uno = 2-5 minutos colgado, sin feedback de progreso. El mismo patrón existe en `applyCompras` y `applyTransferencias`, pero conteo es el más usado.

A esto se suma `saveLearnings` que hace 1 SELECT + 1 UPDATE/INSERT por producto único, también secuencial.

## Solución

Mover el procesamiento al servidor con un **RPC SECURITY DEFINER** que recibe el lote completo como JSONB y aplica todo en una sola transacción. El cliente pasa de hacer 1.750 llamadas a hacer **1 sola llamada**.

### 1. Migración: nuevo RPC `apply_conteo_batch`

Función PL/pgSQL que recibe:
- `p_venue_id uuid`
- `p_user_id uuid`
- `p_batch_id uuid`
- `p_rows jsonb` — array `[{ product_id, location_id, stock_real }, ...]`

Y dentro hace, en una sola transacción:
- `UPDATE stock_balances` masivo con CTE para filas existentes
- `INSERT ... ON CONFLICT (product_id, location_id, venue_id) DO UPDATE` para crear las que falten (requiere índice único; si no existe, lo creamos)
- `INSERT INTO stock_movements` masivo (un solo INSERT con SELECT desde la diferencia calculada)
- `UPDATE products SET current_stock = (SELECT SUM…)` agregado por producto en un solo statement
- Devuelve `{ applied: int, skipped: int }`

Validación dentro del RPC: el `venue_id` del usuario debe coincidir (vía `get_user_venue_id()`) y solo aplica filas donde `stock_real != balance_actual`.

### 2. RPCs análogos para Compras y Transferencias

Mismo patrón aplicado a `applyCompras` (incluyendo recálculo CPP en SQL) y `applyTransferencias`. Esto deja los tres flujos masivos con tiempo de respuesta de segundos en vez de minutos.

### 3. RPC `save_learning_mappings_batch`

Recibe el array de mappings y hace un único `INSERT ... ON CONFLICT (raw_text, venue_id) DO UPDATE SET times_used = times_used + 1, ...`. Reemplaza el bucle SELECT+UPDATE/INSERT por fila.

### 4. Cliente: refactor `InventoryHub.tsx`

- `applyConteos`, `applyCompras`, `applyTransferencias` y `saveLearnings` se reducen a una sola llamada `supabase.rpc(...)`.
- Toast de "Aplicando lote…" con spinner (ya existe `setApproving`), y al finalizar muestra `{ applied } filas aplicadas`.
- Si el lote es muy grande (>1000 filas), particionar en chunks de 500 antes de mandar al RPC para evitar timeout de edge.

### 5. Índice único requerido

```sql
CREATE UNIQUE INDEX IF NOT EXISTS stock_balances_product_location_venue_uniq
ON public.stock_balances(product_id, location_id, venue_id);
```

Necesario para `ON CONFLICT` y además previene duplicados de saldo (bug latente).

## Resultado esperado

- 350 filas de conteo: de **2-5 minutos → ~3-8 segundos**.
- Una sola transacción atómica: si algo falla, no queda el lote a medio aplicar.
- Aplica también a Compras y Transferencias masivas.
- El `current_stock` y los movimientos quedan consistentes en un solo paso.

## Archivos a tocar

- `supabase/migrations/<nuevo>.sql` — RPCs `apply_conteo_batch`, `apply_compra_batch`, `apply_transferencia_batch`, `save_learning_mappings_batch` + índice único en `stock_balances`.
- `src/components/dashboard/InventoryHub.tsx` — reemplazar `applyConteos`, `applyCompras`, `applyTransferencias` y `saveLearnings` por llamadas RPC con chunking opcional.

## Validación

- Subir un Excel de conteo de 350 filas y confirmar que la aprobación termina en < 10s.
- Verificar que `stock_balances`, `stock_movements` y `products.current_stock` quedan consistentes.
- Probar con un lote que tenga filas nuevas (sin balance previo) y filas existentes mezcladas.

