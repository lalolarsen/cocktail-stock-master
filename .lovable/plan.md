
# Plan: Implementacion del Metodo de Inventario DiStock

## Resumen Ejecutivo

Este plan detalla la implementacion completa del metodo de inventario DiStock segun el documento proporcionado. El sistema ya tiene una base solida, pero hay brechas importantes que cerrar para cumplir con todas las reglas operativas descritas.

## Analisis del Estado Actual vs Requerido

### Lo que YA funciona correctamente

| Caracteristica | Estado | Notas |
|----------------|--------|-------|
| Stock en ml para liquidos | OK | Productos con `category: ml` |
| Stock unitario (cervezas, etc.) | OK | Productos con `category: unidades` |
| QR genera venta, no descuenta stock | OK | `redeem_pickup_token` es el unico punto de descuento |
| Recetas con ingredientes multiples | OK | Tabla `cocktail_ingredients` funcionando |
| Mixer slot dinamico | PARCIAL | Existe `is_mixer_slot` pero no se usa en barra |
| Consumo FEFO | OK | `consume_stock_fefo` implementado |

### Lo que FALTA implementar

| Caracteristica | Prioridad | Descripcion |
|----------------|-----------|-------------|
| Seleccion de mixer en barra | ALTA | El bartender debe poder elegir el mixer al redimir el QR |
| Destilados: 90ml + mixer obligatorio | ALTA | Template destilados ya existe pero falta enlazar en barra |
| Shots: 45ml fijo | OK | Ya configurado en `CategoryRecipeEditor` |
| Botellas 750ml vendidas completas | OK | Ya configurado |
| Mixers tradicionales (220/350ml) | MEDIA | Clasificar productos como mixers |
| Red Bull como categoria mixer | MEDIA | Categoria separada de mixers |
| Add-ons (ej: Michelada) | BAJA | Sistema de agregados a productos base |

## Flujo de Operacion Objetivo

```text
VENTA EN CAJA                          CANJE EN BARRA
┌──────────────────┐                   ┌──────────────────┐
│ 1. Seleccionar   │                   │ 1. Escanear QR   │
│    producto      │───> QR ───────────│                  │
│    (ej: Ron Cola)│                   │ 2. Si tiene mixer│
│                  │                   │    slot: MOSTRAR │
│ 2. Cobrar        │                   │    seleccion     │
│                  │                   │                  │
│ 3. Imprimir QR   │                   │ 3. Confirmar y   │
│                  │                   │    descontar     │
└──────────────────┘                   │    stock         │
                                       └──────────────────┘
```

## Cambios a Implementar

### 1. Clasificacion de Productos de Inventario (Mixers)

Agregar campo `is_mixer` a la tabla `products` para identificar productos que pueden ser seleccionados dinamicamente en barra.

**Productos a marcar como mixer:**
- Coca Cola (220ml, 350ml)
- Sprite (220ml, 350ml)
- Fanta (220ml, 350ml)
- Ginger Ale (220ml, 350ml)
- Red Bull (250ml) y variantes
- Agua Mineral

### 2. Actualizar Logica de Barra (Bar.tsx)

Integrar el flujo de seleccion de mixer cuando el QR contiene productos con `is_mixer_slot = true`:

1. Escanear QR
2. Llamar a `check_token_mixer_requirements` (ya existe)
3. Si hay mixer slots, mostrar `MixerSelectionDialog`
4. Al confirmar, llamar `redeem_pickup_token` con `p_mixer_overrides`

### 3. Definir Templates de Recetas por Categoria

Actualizar `CategoryRecipeEditor` para que las plantillas reflejen exactamente el metodo DiStock:

| Categoria | Ingredientes | Descuento |
|-----------|--------------|-----------|
| Destilados | 90ml destilado + 1 mixer lata | 90ml + 1 unidad |
| Shots | 45ml destilado | 45ml |
| Cocteleria | Receta variable (ml definidos) | Segun receta |
| Botellas 750ml | 750ml del producto | 750ml |
| Botellas 1L | (solo ingrediente, no venta directa) | N/A |
| Cervezas | 1 unidad | 1 unidad |
| Sin Alcohol | 1 unidad o segun receta | Variable |

### 4. Actualizar UI de Seleccion de Mixer en Barra

Mejorar `MixerSelectionDialog` para:
- Mostrar opciones de mixer agrupadas (Latas tradicionales vs Red Bull)
- Recordar ultima seleccion del cliente por tipo de producto
- Interfaz tactil optimizada para velocidad

## Seccion Tecnica

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Bar.tsx` | Integrar flujo de mixer selection antes de redimir |
| `src/components/bar/MixerSelectionDialog.tsx` | Mejorar UI y agrupacion de opciones |
| `src/components/dashboard/CategoryRecipeEditor.tsx` | Ajustar templates segun metodo DiStock |
| Nueva migracion SQL | Agregar `is_mixer` a tabla products |

### Migracion de Base de Datos

```sql
-- Agregar columna para identificar mixers
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_mixer boolean DEFAULT false;

-- Marcar productos existentes como mixers
UPDATE products SET is_mixer = true 
WHERE name ILIKE '%coca%' 
   OR name ILIKE '%sprite%' 
   OR name ILIKE '%fanta%'
   OR name ILIKE '%ginger%'
   OR name ILIKE '%red bull%'
   OR name ILIKE '%redbull%';

-- Crear indice para busqueda rapida
CREATE INDEX IF NOT EXISTS idx_products_is_mixer ON products(is_mixer) WHERE is_mixer = true;
```

### Logica de Integracion en Bar.tsx

```typescript
// Despues de escanear QR exitosamente
const checkMixerResult = await supabase.rpc("check_token_mixer_requirements", {
  p_token: token
});

if (checkMixerResult.data?.requires_mixer_selection) {
  // Mostrar dialogo de seleccion de mixer
  setMixerSlots(checkMixerResult.data.mixer_slots);
  setShowMixerDialog(true);
} else {
  // Redimir directamente
  await redeemToken(token, null);
}
```

## Plan de Trabajo

### Fase 1: Mixer Selection en Barra (Prioritario) ✅ COMPLETADO
1. ✅ Crear migracion para `is_mixer` en products
2. ✅ Modificar `Bar.tsx` para llamar `check_token_mixer_requirements`
3. ✅ Integrar `MixerSelectionDialog` en el flujo de canje
4. ✅ Pasar `mixer_overrides` a `redeem_pickup_token`
5. ✅ Marcar productos existentes como mixers (coca, sprite, fanta, etc.)

### Fase 2: Actualizacion de Templates
1. Revisar y ajustar `CategoryRecipeEditor` con valores exactos del metodo
2. Actualizar productos existentes sin receta (los que tienen `product_id: null`)

### Fase 3: Clasificacion de Productos
1. Identificar todos los productos mixer en inventario
2. Ejecutar UPDATE para marcarlos como `is_mixer = true`
3. Agregar UI en gestion de productos para marcar mixers

## Beneficios

- **Cumplimiento**: Implementacion exacta del metodo de inventario DiStock
- **Flexibilidad**: Cliente elige mixer al momento del canje
- **Trazabilidad**: Se registra exactamente que mixer se uso
- **Eficiencia**: El bartender solo ve opciones validas

## Riesgos y Mitigaciones

| Riesgo | Mitigacion |
|--------|------------|
| Productos sin clasificar como mixer | Agregar validacion que alerte cuando no hay mixers disponibles |
| Recetas existentes sin mixer slot | Crear script de migracion para actualizar recetas de destilados |
| Bartenders no familiarizados con nuevo flujo | La UI es intuitiva, se puede agregar tutorial |
