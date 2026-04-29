# Plan: Inventario transparente — v2 (conteo ciego + reporte sin $)

Mismo ciclo end-to-end aprobado, con **dos ajustes críticos** solicitados:

1. **Conteo de cierre CIEGO**: el bartender NO ve el stock teórico; solo se le muestran los insumos que su barra utilizó durante la jornada y debe declarar cuánto queda.
2. **Reporte de canjes SIN valores monetarios**: solo cantidades, productos y motivos. Los $ quedan reservados al EERR del admin.

---

## 1. Roles y "quién hace qué"

| Acción | Quién | Dónde | Resultado |
|---|---|---|---|
| Recepción de factura | Admin | Subir factura (IA) → Bodega | Compra + CPP actualizado |
| Reposición pre-jornada | Bartender | App tablet (autoservicio) | Transferencia Bodega→Barra firmada |
| Emergencia en jornada | Bartender pide / Admin aprueba | Misma app, notif realtime | Transferencia marcada "emergencia" |
| Venta | Cajero | POS | QR emitido (no toca stock) |
| Redención | Bartender | Bar | Descuento real en su barra |
| **Conteo de cierre (CIEGO)** | Bartender | App, solo insumos usados | Declara cantidad real, sin ver teórico |
| Conteo semanal | Admin + bartenders | Excel unificado | Ajuste masivo con justificación |
| Aprobación de ajustes | Admin | Panel de ajustes | Movimiento contable trazable |

---

## 2. Flujo operativo

```text
     ┌─────────────┐
     │  FACTURA    │  Admin sube foto → IA parsea
     └──────┬──────┘
            ▼
     ┌─────────────┐
     │  BODEGA     │  CPP recalculado
     └──────┬──────┘
            │ Pre-jornada (autoservicio bartender)
            ▼
     ┌─────────────┐    Emergencia (bartender pide → admin OK)
     │   BARRA     │◄───────────────────────────────────┐
     └──────┬──────┘                                    │
            │ QR redimido = descuento real              │
            ▼                                           │
     ┌─────────────────┐                                │
     │ CIERRE (CIEGO)  │  Solo insumos consumidos hoy.  │
     │                 │  Bartender escribe cantidad    │
     │                 │  real. NO ve teórico.          │
     └──────┬──────────┘                                │
            │ Sistema compara en silencio                │
            ▼                                           │
     ┌─────────────────┐                                │
     │ ADMIN VE GAP    │  Diferencia teórico vs real,   │
     │ (con $ y %)     │  aprueba/rechaza ajuste        │
     └─────────────────┘                                │
                                                        │
     ┌─────────────────────────────────────────────────┘
     │  Semanal: Excel multi-hoja → ajuste masivo
     └──────────────────────────────────────────────────
```

---

## 3. Cambios concretos

### A. Reposición pre-jornada (autoservicio bartender)
Sin cambios respecto a v1: bartender entra a `/bar`, ve productos asignados con sugerido (consumo promedio últimos 7 días), pide cantidad, firma con PIN, ejecuta transferencia Bodega→Barra al CPP del momento. Imprime ticket 80mm.

### B. Emergencia durante jornada
Misma app: bartender genera `replenishment_request` con `is_emergency = true`. Admin recibe **notificación realtime** (toast + badge en sidebar). Aprueba con un clic → ejecuta transferencia. Reemplaza WhatsApp.

### C. Conteo de cierre CIEGO ⭐ (cambio clave)

**Pantalla del bartender al cerrar jornada:**

- Lista **solo de productos que tuvieron movimientos de salida durante esta jornada** (redenciones de QR + mermas + emergencias recibidas). Lo que no se tocó, no aparece.
- Cada fila muestra:
  ```
  Ron Havana 7 años (botella 750ml)
  ¿Cuánto te queda en la barra ahora? [____] ml
  ```
- **NO se muestra**: stock teórico, stock inicial, consumo del día, sugerido, ni ningún número que permita "calzar" el conteo.
- Bartender escribe cantidad real, firma con PIN, envía.
- Si deja un campo vacío, se asume "cero" y debe confirmar explícitamente con un toggle "No queda nada" para evitar errores.

**Detrás de escena (invisible para bartender):**
- Sistema calcula: `diferencia = teórico - declarado`.
- Si `|diferencia| / teórico ≥ 10%` o `≥ 200ml` (lo que sea menor) → se marca como **alerta para admin**.
- Se crea registro en `shift_counts` (jornada_id, location_id, product_id, theoretical_qty, declared_qty, variance_pct, signed_by, signed_at, alerted).

**Vista del admin (separada):**
- Pestaña "Conteos de cierre" en panel admin.
- Ve por jornada/barra: producto, teórico, declarado, diferencia (unidades + CLP), motivo (si lo hay).
- Botones: **Aprobar como merma** | **Rechazar (recontar)** | **Ajuste manual con motivo**.
- Las alertas reincidentes por bartender quedan visibles ("Juan: 3 alertas en últimas 5 jornadas").

### D. Reporte de canjes SIN valores monetarios ⭐ (cambio clave)

**El "Reporte de canjes diario"** que recibe el equipo operativo contiene:

- Total de canjes exitosos del día
- Canjes por barra y por bartender
- Productos canjeados con cantidades (unidades / ml)
- Top productos del día (por cantidad)
- Sección "**Diferencias declaradas en cierre**":
  - Por barra: producto, declarado por bartender, diferencia en unidades (+/−), motivo si lo hay.
  - **Sin CLP, sin CPP, sin valor en pesos.**
- Mermas aprobadas: producto + cantidad + motivo (sin $).
- Emergencias atendidas: producto + cantidad + quién aprobó (sin $).

**El EERR / panel financiero del admin** sigue mostrando todos los valores en CLP — eso no cambia. Solo el reporte de canjes operativo se "desmonetiza".

### E. Conteo semanal — Excel unificado multi-hoja
Sin cambios respecto a v1: plantilla con una hoja por ubicación (Bodega + cada Barra), pre-llenada con `sku_base | producto | unidad | stock contado (vacío)`. Sin teórico en la plantilla del bartender (mismo principio del conteo ciego). El admin sube el Excel relleno → pantalla de validación humana muestra diferencias con CLP solo para el admin → aprueba → ajustes masivos.

### F. Panel del Admin — "Movimientos del día"
Timeline en vivo: reposiciones, emergencias pendientes, redenciones, mermas, conteos cerrados. Filtro por barra/bartender. KPIs: emergencias pendientes, % diferencia último cierre, conteos pendientes de aprobación.

---

## 4. Reglas de negocio

- **Fuente de verdad**: sistema (DiStock) sigue mandando operativamente. Toda diferencia genera ajuste explícito firmado.
- **Conteo ciego**: nunca mostrar al bartender el teórico antes de declarar. Esto evita el sesgo de "calzar" y hace los conteos genuinos.
- **Solo insumos usados**: si un producto no tuvo salida en la jornada, no se cuenta al cierre (ya quedó cuantificado en el conteo semanal o el último ajuste).
- **Reporte de canjes desmonetizado**: protege información sensible de costos frente a personal operativo.
- **EERR del admin**: única vista con CLP, CPP, márgenes y valoración.

---

## 5. Detalles técnicos

- **Tabla nueva** `shift_counts`: `id, venue_id, jornada_id, location_id, product_id, theoretical_qty, declared_qty, variance_qty, variance_pct, alerted boolean, signed_by_user_id, signed_at, admin_decision text ('pending'|'approved_waste'|'rejected'|'manual_adjust'), admin_decision_by, admin_decision_at, admin_notes`. RLS: bartender solo ve sus propios conteos del día; admin ve todo del venue.
- **RPC `get_shift_consumed_products(p_jornada_id, p_location_id)`** → devuelve solo `product_id, name, unit, capacity_ml` de productos con `stock_movements` tipo `salida` en esa jornada/ubicación. **NO devuelve cantidades teóricas.** SECURITY DEFINER con guard de pertenencia bartender↔barra.
- **RPC `submit_blind_shift_count(p_jornada_id, p_location_id, p_lines jsonb)`** → `p_lines = [{product_id, declared_qty}]`. Internamente lee teórico desde `stock_balances`, calcula varianza, inserta en `shift_counts`, marca `alerted` si supera umbral. Devuelve solo `{accepted_count}` (sin revelar varianzas al bartender).
- **RPC `admin_resolve_shift_count(p_count_id, p_decision, p_notes)`** → solo admin. Si `approved_waste` o `manual_adjust`, genera `stock_movement` de ajuste con motivo y firma.
- **RPC `execute_bartender_replenishment(p_lines)`** y **`approve_emergency_request(p_request_id)`** → idénticas a v1.
- **Migración**: agregar columna `is_emergency boolean default false` a `replenishment_requests`.
- **Realtime**: admin suscrito a `replenishment_requests WHERE is_emergency=true AND status='pending'` y a `shift_counts WHERE alerted=true AND admin_decision='pending'`.
- **PDF `daily-redemptions-pdf.ts`** (nuevo): genera reporte de canjes operativo SIN valores en CLP. Reemplaza/complementa el actual.
- **PDF `admin-shift-counts-pdf.ts`** (nuevo, opcional): vista admin con $.
- **Excel multi-hoja**: extender `excel-inventory-parser.ts` para soportar parseo por hoja (cada hoja = location_id resuelto por nombre).
- **UI nuevas**: 
  - `/bar` → tabs "Mi reposición" / "Pedir emergencia" / "Cerrar jornada (conteo)".
  - `/admin` → tabs nuevas "Movimientos del día" y "Conteos por aprobar".

---

## 6. Orden de implementación

1. **Fase 1** — Reposición autoservicio bartender (reemplaza WhatsApp).
2. **Fase 2** — Emergencias con notificación realtime al admin.
3. **Fase 3** — Conteo de cierre CIEGO + tabla `shift_counts` + panel admin para aprobar.
4. **Fase 4** — Reporte de canjes desmonetizado (PDF nuevo).
5. **Fase 5** — Excel unificado semanal multi-hoja.
6. **Fase 6** — Panel "Movimientos del día" del admin.

Cada fase es funcional por sí sola.

---

¿Aprobás esta versión v2 con conteo ciego y reporte sin $? ¿O querés ajustar algún umbral (10% / 200ml) o algún otro detalle antes de implementar?
