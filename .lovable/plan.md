
Objetivo: corregir definitivamente el error al activar/desactivar “Modo Marcha Blanca” desde Gerencia y dejarlo activado para el local activo.

1) Diagnóstico confirmado (causa raíz)
- El toggle actual en `src/components/settings/InventoryFreezeToggle.tsx` hace `insert/update` directo sobre `feature_flags`.
- Ese write falla para Gerencia por RLS (error 42501), porque `feature_flags` solo permite `admin`/`developer`.
- Además hay inconsistencia de fuentes:
  - `useFlags` (UI) lee `get_effective_flags` → `venue_feature_flags`.
  - `is_inventory_frozen` (backend de canje/descuento) lee `feature_flags`.
- Resultado: aunque se escriba en una tabla, otra capa puede seguir viendo el valor opuesto.

2) Ajuste backend (migración SQL, sin romper lógica de inventario)
- Crear RPC dedicada: `set_inventory_freeze_mode(p_enabled boolean, p_venue_id uuid default get_user_venue_id())`
  - `SECURITY DEFINER`.
  - Permitir ejecución a `gerencia`, `admin`, `developer`.
  - Validar que Gerencia/Admin solo puedan modificar su propio `venue_id`.
  - Upsert en `venue_feature_flags` para `flag_key = 'inventory_freeze_mode'`.
- Actualizar `is_inventory_frozen(p_venue_id)` para leer primero `venue_feature_flags`, con fallback seguro:
  1) `venue_feature_flags`
  2) `feature_flags` (compatibilidad temporal)
  3) `feature_flags_master.default_enabled`
- Con esto no se toca la lógica base de descuento; solo se corrige la condición/lectura del flag.

3) Ajuste frontend (Gerencia)
- `src/components/settings/InventoryFreezeToggle.tsx`
  - Reemplazar writes directos a tabla por `supabase.rpc('set_inventory_freeze_mode', ...)`.
  - Mantener invalidación de `['effective-flags', venue.id]`.
  - Mantener toasts y estado loading.
- `src/pages/Admin.tsx`
  - Mantener toggle solo en Configuración cuando `isReadOnly` (Gerencia).
  - Mostrar `InventoryFreezeBanner` solo en Inventario cuando `isReadOnly` (no en Admin).

4) Dejarlo activo al finalizar
- Ejecutar upsert de datos para el venue activo (`4e128e76-980d-4233-a438-92aa02cfb50b`) con `enabled = true` en `venue_feature_flags` para `inventory_freeze_mode`.
- Verificar con query que quede activo y que `is_inventory_frozen(venue)` retorne `true`.

5) Prueba de flujo end-to-end (obligatoria)
- En `/gerencia` → Configuración:
  - Cambiar switch ON sin error RLS.
  - Recargar y confirmar que sigue ON.
- En `/gerencia` → Inventario:
  - Ver banner “Modo Marcha Blanca”.
- Validar aislamiento visual:
  - `/sales` y `/bar` sin banner ni conocimiento del modo.
- Validar efecto funcional:
  - Ejecutar una venta/canje en modo ON.
  - Confirmar que no hay descuentos en `stock_movements` para esa operación.
  - Confirmar que venta/registro se completa y COGS sigue visible en KPIs de jornada.

Detalles técnicos (archivos a tocar)
- `supabase/migrations/<new>.sql`:
  - `create or replace function public.set_inventory_freeze_mode(...)`
  - `create or replace function public.is_inventory_frozen(...)`
  - grants correspondientes.
- `src/components/settings/InventoryFreezeToggle.tsx`
- `src/pages/Admin.tsx`

Resultado esperado
- Gerencia puede activar/desactivar sin errores.
- El estado del flag es consistente entre UI y backend.
- Queda activado al terminar.
- La operación de ventas sigue normal, sin descuento de inventario mientras el modo esté activo.
