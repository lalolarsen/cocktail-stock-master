

# Plan: Sistema de Add-ons Simplificado (Sin Costo de Ingredientes)

## Resumen

Implementar el sistema de Add-ons del Manual DiStock de forma simplificada. Los add-ons son modificadores que agregan un cargo adicional al producto base pero **no rastrean costos de ingredientes** ya que estos se contabilizan como gastos operacionales.

## Flujo Operativo

```text
VENTA EN CAJA                           CANJE EN BARRA
+------------------------+              +------------------------+
| 1. Seleccionar         |              | 1. Escanear QR         |
|    Cerveza ($5.000)    |              |                        |
|                        |              | 2. Mostrar:            |
| 2. Agregar Add-on:     |---> QR ----->|    - Cerveza x1        |
|    "Michelada"         |              |    - Add-on: Michelada |
|    (+ $2.000)          |              |                        |
|                        |              | 3. Preparar y entregar |
| 3. Cobrar $7.000       |              |    (NO descuenta stock |
+------------------------+              |     de add-on)         |
                                        +------------------------+
```

## Diferencia Clave: Sin Tracking de Ingredientes

| Caracteristica | Con Costo (Plan Original) | Sin Costo (Este Plan) |
|----------------|---------------------------|------------------------|
| Tabla addon_ingredients | Requerida | No necesaria |
| Impacto COGS | Si | No |
| Descuento de stock | Si (limon, sal, etc.) | No |
| Complejidad SQL | Alta | Baja |
| Trazabilidad insumos | Por ingrediente | Agregado en gastos operacionales |

## Modelo de Datos Simplificado

```text
+------------------+       +---------------------+       +-------------------+
|   cocktails      |<----->| cocktail_addons     |<----->|   product_addons  |
|   (productos)    |       | (relacion M:N)      |       |   (michelada,     |
+------------------+       +---------------------+       |    sal extra, etc)|
                                                         +-------------------+
                                                                  |
                                                                  v
                                                         +-------------------+
                                                         | sale_item_addons  |
                                                         | (registro de uso) |
                                                         +-------------------+
```

## Cambios a Implementar

### 1. Base de Datos

**Nuevas tablas:**

| Tabla | Proposito |
|-------|-----------|
| product_addons | Catalogo de add-ons disponibles (Michelada, Sal Extra, etc.) |
| cocktail_addons | Relacion de que add-ons aplican a que productos |
| sale_item_addons | Registro de add-ons aplicados en cada venta |

**Campos principales de product_addons:**
- name: Nombre del add-on
- price_modifier: Monto adicional (ej: $2.000)
- is_active: Si esta disponible
- venue_id: Pertenencia al venue

### 2. Interfaz de Administracion

**Nuevo componente: AddonsManagement.tsx**
- CRUD de add-ons
- Asignacion de add-ons a productos del menu
- Configuracion de precio adicional

**Ubicacion:** Seccion Admin, junto a "Carta de Productos"

### 3. Interfaz de Ventas (POS)

**Modificacion a Sales.tsx:**
- Al agregar producto al carrito, mostrar opciones de add-ons disponibles
- Mostrar precio base + precio add-on separados
- Incluir add-ons en el QR generado

### 4. Interfaz de Barra

**Modificacion a Bar.tsx:**
- Mostrar add-ons aplicados junto al producto
- Indicador visual para el bartender (ej: icono de Michelada)

### 5. Reportes

**No hay cambio en COGS** - Los insumos de add-ons se registran como gastos operacionales por fuera del sistema.

## Seccion Tecnica

### Migracion SQL

```sql
-- Catalogo de add-ons
CREATE TABLE product_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_modifier numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Que productos pueden tener que add-ons
CREATE TABLE cocktail_addons (
  cocktail_id uuid REFERENCES cocktails(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES product_addons(id) ON DELETE CASCADE,
  PRIMARY KEY (cocktail_id, addon_id)
);

-- Registro de add-ons usados en cada item de venta
CREATE TABLE sale_item_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES product_addons(id) ON DELETE SET NULL,
  addon_name text NOT NULL, -- Snapshot del nombre
  price_modifier numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indices para rendimiento
CREATE INDEX idx_cocktail_addons_cocktail ON cocktail_addons(cocktail_id);
CREATE INDEX idx_sale_item_addons_item ON sale_item_addons(sale_item_id);

-- RLS
ALTER TABLE product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE cocktail_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_item_addons ENABLE ROW LEVEL SECURITY;

-- Politicas RLS (admin puede todo, vendedores pueden insertar)
CREATE POLICY "Admin full access on product_addons" ON product_addons
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Workers can view addons" ON product_addons
  FOR SELECT USING (has_role(auth.uid(), 'worker'));

CREATE POLICY "Admin full access on cocktail_addons" ON cocktail_addons
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Workers can view cocktail_addons" ON cocktail_addons
  FOR SELECT USING (has_role(auth.uid(), 'worker'));

CREATE POLICY "Admin full access on sale_item_addons" ON sale_item_addons
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Workers can insert sale_item_addons" ON sale_item_addons
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'worker'));
```

### Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| src/components/dashboard/AddonsManagement.tsx | CRUD de add-ons y asignacion a productos |
| src/components/sales/AddonSelector.tsx | Selector de add-ons en carrito de ventas |

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| src/pages/Sales.tsx | Integrar AddonSelector en el carrito |
| src/pages/Bar.tsx | Mostrar add-ons aplicados al canjear QR |
| src/pages/Admin.tsx | Agregar acceso a AddonsManagement |
| src/components/AppSidebar.tsx | Agregar enlace a gestion de add-ons |
| src/components/GuidedTooltip.tsx | Agregar tooltip para add-ons |

### Logica de Ventas (Sales.tsx)

```typescript
// Nuevo estado para add-ons por item
type CartItem = {
  cocktail: Cocktail;
  quantity: number;
  addons: { id: string; name: string; price: number }[];
};

// Calculo de total actualizado
const calculateTotal = () => {
  return cart.reduce((sum, item) => {
    const basePrice = item.cocktail.price * item.quantity;
    const addonsPrice = item.addons.reduce((a, addon) => a + addon.price, 0) * item.quantity;
    return sum + basePrice + addonsPrice;
  }, 0);
};
```

### Flujo al Procesar Venta

```typescript
// Despues de insertar sale_items
for (const item of cart) {
  const { data: saleItem } = await supabase
    .from("sale_items")
    .insert({...})
    .select()
    .single();

  // Insertar add-ons aplicados
  if (item.addons.length > 0) {
    await supabase.from("sale_item_addons").insert(
      item.addons.map(addon => ({
        sale_item_id: saleItem.id,
        addon_id: addon.id,
        addon_name: addon.name,
        price_modifier: addon.price,
      }))
    );
  }
}
```

### Mostrar Add-ons en Barra

El QR ya incluye metadata. Modificar `pickup_tokens.metadata` o la query de `redeem_pickup_token` para incluir los add-ons:

```sql
-- Agregar a la respuesta de deliver
v_items_array := (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', c.name,
      'quantity', si.quantity,
      'addons', COALESCE((
        SELECT jsonb_agg(sia.addon_name)
        FROM sale_item_addons sia
        WHERE sia.sale_item_id = si.id
      ), '[]'::jsonb)
    )
  )
  FROM sale_items si
  JOIN cocktails c ON c.id = si.cocktail_id
  WHERE si.sale_id = v_token_record.sale_id
);
```

## Plan de Trabajo

### Fase 1: Estructura de Datos
1. Crear migracion SQL para las 3 tablas
2. Agregar indices y politicas RLS

### Fase 2: Administracion de Add-ons
1. Crear componente AddonsManagement.tsx
2. Integrar en Admin.tsx
3. Agregar enlace en AppSidebar.tsx

### Fase 3: Integracion en Ventas
1. Crear componente AddonSelector.tsx
2. Modificar Sales.tsx para soportar add-ons en carrito
3. Actualizar logica de insercion de venta

### Fase 4: Visualizacion en Barra
1. Modificar redeem_pickup_token para incluir add-ons
2. Actualizar Bar.tsx para mostrar add-ons aplicados

### Fase 5: Mejoras Adicionales (Opcional)
1. Actualizar tooltips educativos
2. Agregar reportes de add-ons mas vendidos

## Ejemplos de Add-ons Iniciales

| Add-on | Precio | Productos Aplicables |
|--------|--------|----------------------|
| Michelada | $2.000 | Cervezas |
| Sal Extra | $500 | Shots |
| Limones Extra | $1.000 | Destilados |
| Preparado Especial | $2.500 | Botellas |

## Beneficios

- **Simplicidad**: Sin tracking de ingredientes, menos complejidad
- **Flexibilidad**: Add-ons con precio configurable
- **Trazabilidad**: Se registra que add-ons se usaron en cada venta
- **Contabilidad Clara**: Insumos de add-ons van a gastos operacionales, ventas de add-ons generan ingreso

## Riesgos y Mitigaciones

| Riesgo | Mitigacion |
|--------|------------|
| Add-ons sin asignar a productos | Validacion: no mostrar selector si no hay add-ons disponibles |
| Precio de add-on en $0 | Permitido (add-ons cortesia como "Sin hielo") |
| Add-on eliminado despues de venta | Snapshot del nombre en sale_item_addons |

