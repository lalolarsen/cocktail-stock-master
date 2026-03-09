# Guía de Exportación de Datos de la Base de Datos

Este documento contiene instrucciones y scripts para exportar todos los datos de tu base de datos DiStock.

## Opción 1: Exportar desde la Interfaz de Lovable Cloud

### Desde el navegador (Desktop):
1. Abre la vista **Cloud** (icono de nube en la barra superior)
2. Ve a la sección **Database**
3. Selecciona cada tabla que quieras exportar
4. Usa el botón de exportación o copia los datos

### Desde el navegador (Mobile):
1. Toca el botón de menú (⋯) en la esquina inferior derecha
2. Selecciona **Cloud**
3. Ve a **Database**
4. Navega por las tablas y exporta los datos que necesites

## Opción 2: Consultas SQL para Exportar Datos

Puedes ejecutar estas consultas en la consola de Cloud → Database → SQL Editor:

### Listar todas las tablas
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

### Exportar datos de una tabla específica (ejemplo: products)
```sql
SELECT * FROM products;
```

### Contar registros por tabla
```sql
SELECT 
  schemaname,
  tablename,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
   WHERE n.nspname = schemaname AND c.relname = tablename) as row_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

## Opción 3: Script de Exportación Completo

Si tienes acceso a la terminal de Supabase o puedes ejecutar funciones edge, aquí está el código:

### Función SQL para exportar todo
```sql
-- Ejecuta esto en Cloud → Database → SQL Editor

DO $$
DECLARE
  table_record RECORD;
  row_record RECORD;
  sql_output TEXT := '-- Exportación completa de datos' || E'\n\n';
BEGIN
  -- Iterar sobre todas las tablas
  FOR table_record IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    sql_output := sql_output || '-- Tabla: ' || table_record.table_name || E'\n';
    
    -- Para cada tabla, generar los INSERTs
    -- (Este es un ejemplo simplificado, necesitarías adaptar el formato)
    EXECUTE 'SELECT COUNT(*) FROM ' || table_record.table_name INTO row_record;
    sql_output := sql_output || '-- Total de registros: ' || row_record.count || E'\n\n';
  END LOOP;
  
  RAISE NOTICE '%', sql_output;
END $$;
```

## Opción 4: Exportación Manual por Tabla

### Tablas Principales a Exportar:

#### 1. Configuración y Catálogo
- `venues` - Locales/sedes
- `products` - Productos del inventario
- `cocktails` - Cócteles/recetas
- `cocktail_ingredients` - Ingredientes de cócteles
- `product_addons` - Complementos de productos
- `stock_locations` - Ubicaciones de stock

#### 2. Datos Operacionales
- `jornadas` - Jornadas de trabajo
- `sales` - Ventas realizadas
- `sale_items` - Detalles de cada venta
- `purchases` - Compras/facturas
- `purchase_lines` - Líneas de compra
- `stock_transfers` - Transferencias de inventario
- `stock_entries` - Entradas de stock

#### 3. Usuarios y Roles
- `profiles` - Perfiles de usuarios
- `user_roles` - Roles asignados
- `login_history` - Historial de accesos

#### 4. Financiero
- `jornada_financial_summary` - Resúmenes financieros
- `expenses` - Gastos operacionales
- `gross_income_entries` - Ingresos brutos

#### 5. Tokens y Cortesías
- `pickup_tokens` - Tokens de retiro
- `courtesy_qr` - QR de cortesías
- `courtesy_redemptions` - Redenciones

## Opción 5: Usar pgAdmin o Cliente PostgreSQL

Si tienes las credenciales de conexión de tu base de datos:

```bash
# Exportar toda la base de datos
pg_dump -h <host> -U postgres -d postgres --data-only > backup_datos.sql

# Exportar solo ciertas tablas
pg_dump -h <host> -U postgres -d postgres --data-only -t products -t sales > backup_parcial.sql
```

## Opción 6: Exportar desde el Código de la Aplicación

Puedes crear una página temporal en tu aplicación que:

1. Se conecte a todas las tablas usando el cliente de Supabase
2. Itere sobre los datos
3. Genere un archivo SQL descargable

Código de ejemplo:

```typescript
import { supabase } from "@/integrations/supabase/client";

async function exportAllData() {
  const tables = [
    'venues', 'products', 'cocktails', 'sales', 
    'jornadas', 'purchases', 'profiles'
    // ... añade todas las tablas que necesites
  ];
  
  let sqlDump = "-- Exportación de datos\n\n";
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*');
    
    if (data) {
      sqlDump += `-- Datos de ${table}\n`;
      data.forEach(row => {
        const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
        const values = Object.values(row).map(v => 
          v === null ? 'NULL' : 
          typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : 
          v
        ).join(', ');
        sqlDump += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
      });
      sqlDump += "\n";
    }
  }
  
  // Descargar el archivo
  const blob = new Blob([sqlDump], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup_datos.sql';
  a.click();
}
```

## Formato de los Datos Exportados

Los datos se exportarán en formato SQL con sentencias INSERT:

```sql
INSERT INTO products ("id", "name", "price", "venue_id") VALUES 
  ('uuid-1', 'Producto 1', 1000, 'venue-uuid');
INSERT INTO products ("id", "name", "price", "venue_id") VALUES 
  ('uuid-2', 'Producto 2', 2000, 'venue-uuid');
```

## Recomendaciones

1. **Exporta por lotes**: Si tienes muchos datos, exporta por tabla o por fecha
2. **Verifica la integridad**: Después de exportar, verifica que todos los datos estén completos
3. **Backup regular**: Programa exportaciones periódicas
4. **Comprime los archivos**: Los dumps SQL pueden ser grandes, comprime con gzip

## Notas Importantes

- El formato SQL incluye todas las columnas y valores
- Los UUIDs se mantienen tal cual
- Las fechas se exportan en formato ISO
- Los valores NULL se representan como NULL
- Los JSON se exportan como texto

## Soporte

Si necesitas ayuda adicional para exportar los datos o prefieres un formato específico (CSV, JSON, Excel), contacta al equipo de desarrollo.

---

**Última actualización**: 2026-03-09
