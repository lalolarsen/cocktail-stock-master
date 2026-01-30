

# Plan: Importar Carta de Productos y Enlazar con Inventario

## Resumen Ejecutivo

Crear un sistema de importacion masiva desde Excel para la carta de productos (`cocktails`) con la capacidad de enlazar automaticamente cada producto con su equivalente en inventario (`products`), permitiendo el descuento automatico de stock cuando se canjea un QR.

## Estructura del Excel Recibido

```text
| Producto                | Formato |
|-------------------------|---------|
| Alto del Carmen 35° L   | 1000    |
| Mistral 35°             | 750     |
| Heineken                | 330     |
| Coca Cola               | 220/350 |
```

**Observaciones:**
- "Formato" representa el contenido en ml de cada presentacion
- Algunos productos tienen formatos multiples (220/350)
- No incluye precios ni categorias (habria que agregarlos o asignar defaults)

## Flujo de Importacion Propuesto

```text
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  1. Subir Excel  │───>│ 2. Mapear a      │───>│ 3. Enlazar con   │───>│ 4. Confirmar     │
│  de la Carta     │    │ Inventario       │    │ Ingredientes     │    │ e Importar       │
└──────────────────┘    └──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Paso 1: Subir Excel
- Arrastrar archivo o seleccionar
- Parser detecta columnas de nombre y formato

### Paso 2: Mapear a Inventario
Para cada producto de la carta, el sistema busca un producto similar en `products`:

| Carta (Excel)           | Inventario (Match)      | Accion          |
|-------------------------|-------------------------|-----------------|
| Alto del Carmen 35° L   | (no existe)             | Crear producto  |
| Havana Blanco 3 años    | Ron Havana 3 Años       | Enlazar         |
| Vodka Absolut           | Vodka Absolut           | Enlazar         |
| Heineken                | (no existe)             | Crear producto  |

### Paso 3: Definir Receta Automatica
Para productos tipo "botella", la receta es simple:
- 1 botella = X ml del producto de inventario

```text
Ejemplo: "Alto del Carmen 35° 750cc"
Receta: [1 x 750ml de "Alto del Carmen 35°" del inventario]
```

### Paso 4: Vista Previa y Confirmacion
Mostrar resumen antes de importar:
- Productos nuevos a crear en carta
- Productos nuevos a crear en inventario
- Enlaces automaticos detectados

## Componentes a Crear

### 1. MenuImportDialog.tsx (Nuevo)
Dialogo modal para importar la carta desde Excel con:
- Zona de drag-and-drop para archivo
- Vista de mapeo producto-inventario
- Selector de categoria por defecto
- Campo para precio por defecto
- Boton de confirmacion

### 2. Mejoras al CocktailsMenu.tsx
- Agregar boton "Importar desde Excel" en el header
- Integrar el nuevo dialogo de importacion

## Logica de Negocio

### Tipos de Productos

| Tipo          | Ejemplo                    | Receta                        | Descuento Stock          |
|---------------|----------------------------|-------------------------------|--------------------------|
| Botella       | ALTO 35 750CC              | 1x producto inventario (750ml)| Descuenta 750ml al canjear |
| Botella Litro | MISTRAL 35° L              | 1x producto inventario (1000ml)| Descuenta 1000ml         |
| Lata/Botella  | Heineken 330               | 1x unidad                     | Descuenta 1 unidad       |
| Coctel        | Mojito                     | 60ml ron + 20ml jarabe + ...  | Descuenta cada ingrediente|

### Creacion Automatica de Recetas

Para productos simples (botellas, latas), el sistema crea automaticamente:

```sql
-- Al importar "ALTO 35 750CC" con precio $50,000
-- 1. Crear en cocktails
INSERT INTO cocktails (name, price, category, venue_id)
VALUES ('ALTO 35 750CC', 50000, 'botellas', venue_id);

-- 2. Buscar/crear producto de inventario
-- Si no existe "Alto del Carmen 35° 750" en products, crearlo
INSERT INTO products (name, category, unit, current_stock, venue_id)
VALUES ('Alto del Carmen 35° 750', 'ml', 'ml', 0, venue_id);

-- 3. Crear enlace en cocktail_ingredients
INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity, venue_id)
VALUES (cocktail.id, product.id, 750, venue_id);
```

## Plantilla Excel Sugerida

Para facilitar la importacion, crear una plantilla con columnas adicionales:

| Producto              | Formato | Categoria | Precio  |
|-----------------------|---------|-----------|---------|
| Alto del Carmen 35° L | 1000    | botellas  | 50000   |
| Mistral 35°           | 750     | botellas  | 45000   |
| Heineken              | 330     | botellines| 3500    |
| Mojito                | (vacio) | cocteleria| 8000    |

## Seccion Tecnica

### Archivos a Crear/Modificar

| Archivo | Accion | Descripcion |
|---------|--------|-------------|
| `src/components/dashboard/MenuImportDialog.tsx` | Crear | Componente de importacion Excel |
| `src/components/dashboard/CocktailsMenu.tsx` | Modificar | Agregar boton de importacion |

### Logica del Parser

```typescript
interface ImportedProduct {
  name: string;           // Nombre del producto
  format: number | null;  // ml/g/unidades
  category?: string;      // Categoria (opcional)
  price?: number;         // Precio (opcional)
  matchedInventoryId?: string; // ID del producto de inventario si hay match
  matchScore?: number;    // Score de similitud del nombre
}
```

### Algoritmo de Matching

1. Normalizar nombres (lowercase, sin acentos, sin espacios extra)
2. Buscar coincidencia exacta
3. Si no hay exacta, usar similitud de strings (Levenshtein o similar)
4. Mostrar sugerencias con score > 70%
5. Permitir seleccion manual si no hay match

### Flujo de Descuento de Stock

Una vez importados los productos con sus recetas:

```text
1. Cliente compra "ALTO 35 750CC" → pickup_token creado
2. Barman escanea QR → redeem_pickup_token()
3. Sistema lee cocktail_ingredients del cocktail
4. Por cada ingrediente, crea stock_movement (salida)
5. Actualiza stock_balances de la barra
```

## Beneficios

- **Carga rapida**: Importar toda la carta desde un Excel existente
- **Enlace automatico**: Cada producto de venta conectado a su inventario
- **Trazabilidad**: Cada QR canjeado descuenta los ingredientes correctos
- **Cuadre de inventario**: Comparar consumo teorico vs fisico por barra

