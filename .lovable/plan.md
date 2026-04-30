# Plan: Inventario transparente — v3 (definitivo)

## Decisiones consolidadas

| Tema | Decisión |
|---|---|
| Fuente de verdad | Sistema (DiStock); diferencias quedan explícitas en reporte de canjes |
| Umbral de alerta | **Sin umbral**: admin ve TODA diferencia, decide caso a caso |
| Conteo no resuelto | **Bloquea apertura** de la siguiente jornada hasta que admin resuelva |
| Reposición pre-jornada | Bartender pide → admin aprueba (mismo flujo que emergencia) |
| Emergencias sin respuesta | Espera indefinida + recordatorio persistente en dashboard admin |
| Ámbito conteo ciego | Insumos con salida en jornada **+ botellas cerradas en barra** |
| Botellas abiertas | Slider visual 0–100% (declara ml restantes) |
| Botellas cerradas | Cuenta TODAS las cerradas en barra (no solo recibidas hoy) |
| Reposición ejecutada | Admin aprueba en app + verbal (maneja llaves de bodega) |
| Conteo semanal | Encargado externo cuenta físicamente; sube planilla → app concilia automático |
| Diferencias semanales | Sistema **genera informe**, no fuerza resolución (responsabilidad del cliente) |
| Cierre sin movimiento | Pantalla con botón "Sin consumos hoy" para confirmación explícita |
| Reporte de canjes | **Sin valores monetarios** — solo cantidades, productos, motivos |

---

## Flujo end-to-end

```
FACTURA (IA) → BODEGA (CPP)
     ↓
[Bartender pide reposición pre-jornada] → Admin aprueba en app + entrega física
     ↓
JORNADA ACTIVA
  ├─ Venta POS → QR (no toca stock)
  ├─ Redención QR en barra → descuenta stock real
  └─ [Emergencia] Bartender pide → Admin aprueba (espera indefinida + recordatorio)
     ↓
CIERRE CIEGO por bartender
  ├─ Lista: insumos con salida + todas las botellas cerradas en barra
  ├─ Botellas abiertas: slider 0–100% (ml)
  ├─ Botellas cerradas: contador unidades
  ├─ Si no hubo movimiento → botón "Sin consumos hoy"
  └─ NO ve teórico, NO ve sugerido
     ↓
ADMIN ve diferencias (con $ y %) → aprueba/rechaza/ajusta
  └─ Si quedan pendientes → BLOQUEA próxima apertura de jornada
     ↓
SEMANAL: encargado cuenta físicamente → sube planilla
  └─ App concilia automático → genera INFORME (no fuerza resolución)
```

---

## Cambios concretos

### A. Reposición pre-jornada (bartender pide, admin aprueba)
- Bartender en `/bar` ve productos asignados con sugerido (consumo 7 días).
- Genera `replenishment_request` con `is_emergency=false`.
- Admin recibe en panel; aprueba con un clic.
- Entrega física la coordina admin (tiene llaves de bodega).
- Al aprobar: ejecuta transferencia Bodega→Barra al CPP del momento.

### B. Emergencia durante jornada
- Mismo flujo, pero `is_emergency=true`.
- **Toast realtime + badge persistente** en sidebar admin (no desaparece hasta resolverse).
- Recordatorio cada 5 min mientras siga pendiente.
- Sin auto-aprobación: espera indefinida.

### C. Conteo de cierre CIEGO ⭐

**Pantalla bartender:**
1. Header: "Cierre de [Barra X] — Jornada N°{n}".
2. Si NO hay productos consumidos ni cerradas → solo botón "Sin consumos hoy" + firma PIN.
3. Si hay productos:
   - **Sección "Botellas abiertas"** (las que tuvieron salida o están abiertas):
     ```
     Ron Havana 7 años (750ml)
     [slider visual 0% ━━●━━━━━━ 100%] → 425 ml
     ☐ No queda nada (toggle alternativo)
     ```
   - **Sección "Botellas cerradas en barra"** (todas las cerradas asignadas):
     ```
     Ron Havana 7 años (750ml cerrada)
     Cantidad: [  3  ] unidades
     ```
   - **Sección "Unitarios consumidos"** (cervezas, bebidas, etc.):
     ```
     Cerveza Heineken 330ml
     Cantidad restante: [  12  ]
     ```
4. Botón "Firmar y enviar" → PIN.

**Backend (invisible para bartender):**
- `submit_blind_shift_count` calcula varianza por línea, inserta en `shift_counts` con `admin_decision='pending'`.
- TODA diferencia ≠ 0 queda lista para admin (sin filtro por umbral).
- Devuelve `{accepted_count}` sin revelar varianzas.

### D. Panel admin "Conteos por aprobar"
Tabla por jornada/barra: producto | teórico | declarado | dif (uds + CLP) | acciones.
Acciones: **Aprobar como merma** | **Ajuste manual (motivo)** | **Rechazar (recontar)**.
Tracking reincidencia por bartender ("Juan: 3 alertas / 5 jornadas").

### E. Bloqueo apertura próxima jornada
- `manage-jornadas` (open) verifica si hay `shift_counts` con `admin_decision='pending'` del venue.
- Si los hay → 403 con mensaje "Hay N conteos pendientes de resolver. Resuélvelos antes de abrir nueva jornada".

### F. Reporte de canjes SIN $
PDF/UI operativo:
- Total canjes, por barra, por bartender.
- Productos canjeados (uds/ml).
- Top productos por cantidad.
- **Sección "Diferencias declaradas en cierre"**: producto, declarado, diferencia uds (+/−), motivo. Sin CLP.
- **Sección "Reajustes aplicados"**: ajustes admin con motivo.
- Mermas aprobadas (uds, motivo).
- Emergencias atendidas (producto, uds, quién aprobó).
- **Cero CLP/CPP en todo el documento.**

### G. Conteo semanal — importación + informe
1. Encargado externo cuenta cada barra + bodega (a su manera).
2. Sube planilla Excel/CSV a la app (formato libre con `sku_base | cantidad | location_name`).
3. App parsea con fuzzy matching, muestra preview con diferencias vs sistema.
4. Admin aprueba carga → genera `stock_movements` tipo `conteo_ajuste` por cada diferencia.
5. App genera **INFORME PDF** descargable: producto, ubicación, sistema, contado, diferencia (uds + CLP), histórico de movimientos del producto en últimos 7 días.
6. **No hay flujo de "resolución obligatoria"**: el cliente decide qué hacer con el informe.

---

## Datos / RPCs

### Tabla `shift_counts` (ya creada en migración previa)
```
id, venue_id, jornada_id, location_id, product_id,
theoretical_qty, declared_qty, variance_qty, variance_pct,
alerted boolean, signed_by_user_id, signed_at,
admin_decision text ('pending'|'approved_waste'|'rejected'|'manual_adjust'),
admin_decision_by, admin_decision_at, admin_notes
```
**Cambio v3**: `alerted` siempre `true` cuando `variance_qty != 0` (sin umbral).

### RPCs
- `get_shift_consumed_products(p_jornada_id, p_location_id)` → productos con salida + botellas cerradas asignadas. Sin teórico.
- `submit_blind_shift_count(p_jornada_id, p_location_id, p_lines jsonb)` → declara, calcula varianza, inserta.
- `admin_resolve_shift_count(p_count_id, p_decision, p_notes)` → resuelve.
- `check_pending_shift_counts(p_venue_id)` → boolean para bloqueo de apertura.
- `approve_emergency_request(p_request_id)` → ya existe.
- `import_weekly_count(p_lines jsonb)` → procesa planilla, genera ajustes + informe.

### Realtime
- Admin suscrito a `replenishment_requests is_emergency=true status='pending'` (toast + badge persistente).
- Admin suscrito a `shift_counts admin_decision='pending'` (badge en sidebar).

### PDFs nuevos
- `daily-redemptions-pdf.ts` (sin $).
- `weekly-count-report-pdf.ts` (informe semanal con $ para admin).

---

## Orden de implementación

1. ✅ **Fase 1**: Tabla `shift_counts`, RPC base, dialog ciego, replenishment con `is_emergency`.
2. ✅ **Fase 2**: Dialog ciego con cerradas + slider 0-100% + "Sin consumos hoy".
3. ✅ **Fase 3**: Sin umbral. Panel admin "Conteos por aprobar" con resolución.
4. ✅ **Fase 4**: Bloqueo apertura próxima jornada cuando hay pendientes.
5. ✅ **Fase 5**: Recordatorio persistente de emergencias en dashboard admin.
6. ✅ **Fase 6**: PDF reporte de canjes sin $ con secciones de diferencias y reajustes.
7. ✅ **Fase 7**: Importador semanal (planilla → preview → ajustes opcionales → informe PDF).

Cada fase es funcional por sí sola. Empiezo por Fase 2 en el siguiente turno.
