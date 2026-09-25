# Cortesías más simples

## Qué cambia
- **Motivos nuevos**: Socio, Embajador, Cumpleaños, DJ, Devoluciones, Otros (reemplazan los actuales).
- **Se quita "Cortesías" del menú Avanzado** (administración y gerencia). Queda solo "Tablet Cortesías" para emitir tickets de cortesía. Las cortesías siguen apareciendo en los reportes de cierre.
- **Tragos más pedidos primero**: al elegir el producto, arriba aparecen en botones grandes los 8 tragos más vendidos de los últimos 30 días. Debajo sigue el buscador con la lista completa.
- **Botón "Volver"**:
  - En Tablet Cortesías, un botón visible arriba para volver al panel de administración (sin cerrar la sesión).
  - Mismo botón en las pantallas de pantalla completa a las que entra el administrador: Caja de Entradas, Caja de Alcohol y Guardarropía. Solo lo ve quien tiene acceso al panel; los vendedores siguen viendo solo "Bloquear".
  - Dentro del flujo de cortesía, el paso de producto mantiene "Cambiar" para volver a elegir.

## Qué no cambia
- Cómo se emite e imprime la cortesía (RawBT directo) ni la jornada impresa.
- Las cortesías antiguas conservan su motivo original.

## Detalles técnicos
- `src/pages/Cortesias.tsx`: nuevo `MOTIVOS`; query de top 8 `sale_items` agrupados por `cocktail_id` (30 días, ventas no anuladas) con `fetchAllRows`; grilla "Más pedidos" sobre el buscador; botón Volver → `/admin`.
- `src/components/AppSidebar.tsx`: quitar `courtesy-qr` de los menús Avanzado; mantener la entrada Tablets.
- `src/pages/Tickets.tsx`, `src/pages/Sales.tsx`, `src/pages/Guardarropia.tsx`: botón Volver a `/admin` visible solo para roles admin/gerencia/developer (vía `useUserRole`).
- Sin cambios en base de datos.
