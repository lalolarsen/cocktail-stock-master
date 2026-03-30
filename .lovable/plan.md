

# Plan: Flujo de Anulaciones con Autorización

## Resumen
Implementar un sistema donde las cajas solo crean **solicitudes** de anulación. La ejecución real (cancelar tokens, marcar venta, ajustar inventario) ocurre únicamente tras aprobación de admin/gerencia.

## 1. Base de datos (2 migraciones)

**Migración 1 — Tablas y enums:**
```sql
CREATE TYPE void_request_type AS ENUM ('pre_redeem','post_redeem','unknown');
CREATE TYPE void_request_status AS ENUM ('pending','approved','rejected','executed','cancelled');
CREATE TYPE void_execution_mode AS ENUM ('void_only','refund_with_inventory_return','refund_with_loss');
CREATE TYPE void_event_type AS ENUM ('void_pre_redeem','refund_post_redeem');
CREATE TYPE void_inventory_resolution AS ENUM ('none','returned_to_stock','recognized_as_loss');

-- void_requests
CREATE TABLE public.void_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  sale_id uuid NOT NULL REFERENCES sales(id),
  request_type void_request_type NOT NULL DEFAULT 'unknown',
  reason text NOT NULL,
  notes text,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status void_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  execution_mode void_execution_mode,
  executed_at timestamptz
);

-- void_events
CREATE TABLE public.void_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  sale_id uuid NOT NULL REFERENCES sales(id),
  void_request_id uuid NOT NULL REFERENCES void_requests(id),
  event_type void_event_type NOT NULL,
  inventory_resolution void_inventory_resolution NOT NULL DEFAULT 'none',
  reason text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
```
RLS: lectura por venue_id para authenticated, escritura controlada vía RPCs.

**Migración 2 — RPCs:**

- `request_sale_void(p_sale_id, p_reason, p_notes)`: consulta pickup_tokens del sale, clasifica request_type, inserta void_request pending.
- `review_void_request(p_request_id, p_action, p_review_notes, p_execution_mode)`: valida rol admin/gerencia, actualiza status a approved/rejected.
- `execute_void_request(p_void_request_id)`: recalcula estado REAL de tokens, ejecuta lógica transaccional (cancelar tokens o marcar refund), crea void_event, ajusta inventario según execution_mode, actualiza sales.is_cancelled/status.

## 2. Frontend — Sales: sección "Ventas recientes"

**Archivo:** `src/pages/Sales.tsx` + nuevo componente `src/components/sales/RecentSalesPanel.tsx`

- Añadir sección colapsable "Ventas recientes" debajo del carrito
- Query: últimas ~20 ventas de la jornada activa en el POS seleccionado
- Filtros inline: hora, total, productos, caja
- Cada fila muestra: hora, total, items, payment_method, badge de estado (si tiene void_request pendiente/aprobada)
- Botón "Solicitar anulación" abre modal `VoidRequestDialog`

**Nuevo componente:** `src/components/sales/VoidRequestDialog.tsx`
- Props: sale_id, onSuccess
- Campo motivo (obligatorio), notas (opcional)
- Llama RPC `request_sale_void`
- Toast de confirmación

## 3. Frontend — Admin: vista de anulaciones

**Nuevo componente:** `src/components/dashboard/VoidRequestsPanel.tsx`

- Lista solicitudes pending del venue
- Detalle expandible: datos de venta, items, tokens (estado actual), motivo
- Botones aprobar/rechazar con modal para review_notes y selección de execution_mode (solo si hay tokens redimidos)
- Botón "Ejecutar" tras aprobación (llama `execute_void_request`)
- Badge de estado por solicitud

**Integración en Admin:**
- Añadir `"voids"` al ViewType en `Admin.tsx` y `AppSidebar.tsx`
- Nuevo item en sidebar sección Operación: "Anulaciones" con icono `Undo2`
- Solo visible para admin (no gerencia read-only, o sí si se desea — por defecto admin+gerencia)

## 4. Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| migración SQL (tablas + enums) | Crear |
| migración SQL (RPCs) | Crear |
| `src/components/sales/RecentSalesPanel.tsx` | Crear |
| `src/components/sales/VoidRequestDialog.tsx` | Crear |
| `src/components/dashboard/VoidRequestsPanel.tsx` | Crear |
| `src/pages/Sales.tsx` | Añadir RecentSalesPanel |
| `src/pages/Admin.tsx` | Añadir vista "voids" |
| `src/components/AppSidebar.tsx` | Añadir item Anulaciones |
| `src/lib/db-tables.ts` | Añadir helpers void_requests/void_events |

## Reglas de negocio clave

- Nunca se borran sales ni tokens
- Si entre solicitud y ejecución el estado cambió (ej. pre→post redeem), se usa el estado REAL recalculado
- Todo queda auditado en void_events
- Solo admin/gerencia pueden aprobar y ejecutar

