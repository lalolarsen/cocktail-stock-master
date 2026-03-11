

# Plan: Carga Completa de Inventario Definitivo — Berlín Valdivia

## Resumen

Cargar el inventario exacto del Excel `Definitivo_Decimales.xlsx` en la base de datos, creando 3 productos faltantes, actualizando costos, y estableciendo los balances por ubicación.

## Ubicaciones (todas existen)

| Excel | ID en DB |
|---|---|
| Bodega | `d89d6a6a-173e-47df-a160-349e1bfd077b` |
| Terraza | `a1000000-...-0005` |
| Pista | `a1000000-...-0003` |
| Club | `a1000000-...-0004` |
| VIP Pista | `a1000000-...-0001` |
| VIP Terraza | `a1000000-...-0002` |

## Productos a crear (3)

| Producto | capacity_ml | unit | is_mixer | cost_per_unit |
|---|---|---|---|---|
| Olmeca Dark Chocolate | 700 | ml | false | 5000 |
| Gin House | 700 | ml | false | 5000 |
| K. Lager Blanc | NULL | unidad | false | 5000 |

"Coca Cola 1,5" del Excel → crear como **Coca Cola 1.5L** (capacity_ml=1500, is_mixer=true, cost=5000). No existe en la DB (solo existe Coca Cola Zero 1.5L).

**Total: 4 productos nuevos.**

## Mapeo de nombres Excel → DB

Mapeos no triviales:
- Jagermesiter L → Jagermeister L (`5974feda`)
- Jagermesiter → Jagermeister (`e440d8e3`)
- Havna Especial → Havana Especial (`a7ab9dc2`)
- Havna Especial L → Havana Especial L (`05cc30ab`)
- Havana Blanco3años L → Havana Blanco 3 años L (`f9c5a2c4`)
- Havana Blanco 3 años → (`48ea6154`)
- BullDog → Bulldog (`e06d490d`)
- Chivas 12años → Chivas 12 años (`d697e399`)
- Chivas 18a → Chivas 18 años (`4dd9164d`)
- K. Sin Alcohol → Kunstmann Sin Alcohol (`1147f8b4`)
- K. Torobayo → Kunstmann Torobayo (`cd7d1884`)
- K. Gran Torobayo → Kunstmann Gran Torobayo (`dd7815e4`)
- K. Arándano → Kunstmann Arándano (`de6bf4bf`)
- K. VPL → Kunstmann VPL (`21954231`)
- K. Lager Blanc → **CREAR**
- Kunstman VPL Lata → Kunstmann VPL Lata (`44472963`)
- Redbull → Red Bull (`a88002a5`)
- Redbull Sin Azucar → Red Bull Sin Azucar (`ddcd5ec3`)
- Redbull Sandia → Red Bull Sandía (`2e86930c`)
- Redbull Acai → Red Bull Acai (`45cd0cf2`)
- Redbull Arandanos → Red Bull Arándanos (`c3bc3648`)
- Redbull Flor de Sauco → Red Bull Flor de Saúco (`2f20b349`)
- Redbull Fruta del Dragon → Red Bull Fruta del Dragón (`41ea7a19`)
- Redbull Pomelo S/A → Red Bull Pomelo S/A (`90d39567`)
- Redbull Yellow → Red Bull Yellow (`acff7a9b`)
- Mineral con Gas → Agua Mineral con Gas 600ml (`44efea75`)
- Mineral sin Gas → Agua Mineral sin Gas 600ml (`17f6cf32`)
- Agua Mineral 1,5 → Agua Mineral 1.5L (`62e19955`)
- Nectar Naranja → Néctar Naranja 1.5L (`a7ae9b0d`)
- Nectar Piña → Néctar Piña 1.5L (`7d4ccc65`)
- Ginger → Ginger Ale 220ml (`e55310d9`)
- Ginger Zero → Ginger Ale Zero 220ml (`33cd0d9b`)
- Ginger 1,5 → Ginger Ale 1.5L (`7a3058e0`)
- Coca Cola → Coca Cola 220ml (`1e162028`)
- Coca Cola Zero → Coca Cola Zero 220ml (`24b3a365`)
- Coca Cola 1,5 → **CREAR** Coca Cola 1.5L
- Pepsi → Pepsi 220ml (`a3c160e9`)
- Pepsi Zero → Pepsi Zero 220ml (`d38279a6`)
- Tonica → Tónica 220ml (`7b0b47df`)
- Tonica 1,5 → Tónica 1.5L (`4dfbb5f6`)
- Sprite → Sprite 220ml (`60566cf7`)
- gin house → **CREAR**
- Olmeca dark chocolate → **CREAR**

## Conversión de cantidades

- **Botellas (capacity_ml > 0)**: `stock_ml = fracción_botella × capacity_ml`
  - Ej: Beefeater Pink, Bodega=3.0 → 3.0 × 750 = 2250 ml
- **Unidades (capacity_ml = NULL)**: cantidad directa
  - Ej: Heineken, Bodega=11 → 11 unidades
- **Aguas 600ml**: Estas tienen capacity_ml=NULL y unit=unidad, así que van como unidades directas

## Costos

- Productos con "Costo Neto ($)" en el Excel → UPDATE `cost_per_unit` con ese valor
- Productos sin costo neto → SET `cost_per_unit = 5000`

## Pasos de ejecución

1. **Crear 4 productos** nuevos via INSERT
2. **UPDATE costos** de todos los productos existentes (con dato del Excel o $5000 default)
3. **DELETE stock_balances** existentes del venue completo
4. **INSERT stock_balances** — una fila por cada combinación producto×ubicación donde cantidad > 0
5. **UPDATE products.current_stock** = suma de todos los balances de cada producto

## No se modifican archivos de código
Solo operaciones de datos en las tablas `products` y `stock_balances`.

