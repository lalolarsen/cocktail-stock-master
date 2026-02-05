# DiStock Database Schema Export

Este directorio contiene la exportación completa del esquema de base de datos para DiStock.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `01_enums_and_extensions.sql` | Extensiones y tipos ENUM |
| `02_core_tables.sql` | Tablas base: venues, profiles, roles, feature flags |
| `03_inventory_tables.sql` | Productos, stock, ubicaciones, movimientos |
| `04_pos_and_sales_tables.sql` | POS, cocktails, ventas, pickup tokens |
| `05_tickets_and_covers.sql` | Módulo de tickets y covers |
| `06_cash_and_expenses.sql` | Caja, gastos, resúmenes financieros |
| `07_purchase_import.sql` | Importación de facturas de compra |
| `08_invoicing_and_documents.sql` | Emisión de boletas/facturas |
| `09_audit_and_logs.sql` | Logs de auditoría y notificaciones |
| `10_helper_functions.sql` | Funciones auxiliares (has_role, get_venue_flags) |
| `11_stock_functions.sql` | Funciones de gestión de stock |
| `12_jornada_functions.sql` | Funciones de gestión de jornadas |
| `13_triggers.sql` | Triggers de la base de datos |
| `14_rls_policies.sql` | Políticas de Row Level Security |

## Orden de ejecución

Ejecutar los archivos en orden numérico:

```bash
psql -d your_database -f 01_enums_and_extensions.sql
psql -d your_database -f 02_core_tables.sql
# ... continuar en orden
psql -d your_database -f 14_rls_policies.sql
```

## Notas importantes

1. **Supabase Auth**: Las referencias a `auth.users` y `auth.uid()` requieren que Supabase Auth esté configurado.

2. **Storage**: El código asume que existe un bucket de storage para archivos de facturas.

3. **Edge Functions**: Las edge functions deben desplegarse por separado (ver `/supabase/functions/`).

4. **Datos iniciales**: No se incluyen datos de seed. Necesitarás crear al menos:
   - Un venue
   - Un usuario admin con profile y worker_roles

## Ejemplo de seed inicial

```sql
-- Crear venue
INSERT INTO venues (name, slug, is_demo) 
VALUES ('Mi Venue', 'mi-venue', false);

-- El profile se crea automáticamente cuando un usuario se registra en Supabase Auth
-- Después de que el usuario se registre, asignar rol admin:
INSERT INTO worker_roles (worker_id, role, venue_id)
SELECT 
  p.id,
  'admin',
  p.venue_id
FROM profiles p
WHERE p.email = 'admin@example.com';
```
