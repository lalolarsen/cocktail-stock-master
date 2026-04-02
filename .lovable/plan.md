

# Plan: Actualizar inventario desde Excel del 31 de marzo 2026

## Resumen

Ejecutar un script Python que lea el Excel, mapee cada producto a su registro en la base de datos (venue Berlín Valdivia), y actualice:
1. **`products.current_stock`** — stock total (en ml para botellas, unidades para unitarios)
2. **`products.cost_per_unit`** — costo del Excel; si está vacío: $5.000 para productos >550ml, $800 para ≤550ml
3. **`stock_balances`** — cantidades por ubicación (Bodega, Terraza, Pista, Club, VIP Pista, VIP Terraza)

## Mapeo de ubicaciones

| Excel | DB Location ID |
|---|---|
| Bodega | `d89d6a6a-173e-47df-a160-349e1bfd077b` |
| Terraza | `a1000000-0000-0000-0000-000000000005` |
| Pista | `a1000000-0000-0000-0000-000000000003` |
| Club | `a1000000-0000-0000-0000-000000000004` |
| VIP Pista | `a1000000-0000-0000-0000-000000000001` |
| VIP Terraza | `a1000000-0000-0000-0000-000000000002` |

## Lógica del script

1. Parsear el Excel con pandas
2. Para cada fila del inventario, buscar el producto activo (cost_per_unit > 0) en la DB por nombre
3. Determinar costo: usar el del Excel si existe, sino $5.000 (capacity_ml > 550) o $800 (≤550 o unitario)
4. Calcular current_stock: para botellas = total_unidades × capacity_ml; para unitarios = total_unidades
5. Actualizar products via SQL UPDATE (cost_per_unit, current_stock)
6. Upsert stock_balances por cada ubicación (cantidad en ml o unidades según tipo)

## Productos que requieren mapeo manual (nombres distintos Excel vs DB)

| Excel | DB |
|---|---|
| Chivas 12años | Chivas 12 años |
| Chivas 18a | Chivas 18 años |
| Jagermesiter | Jagermeister |
| Havna Especial | Havana Especial |
| Havna Especial L | Havana Especial L |
| Havana Blanco3años L | Havana Blanco 3 años L |
| Havana Blanco7años L | (no existe — verificar) |
| gin house | Gin House |
| Espumante ricadona | (no existe — verificar) |
| K. Arándano | Kunstmann Arándano |
| K. Gran Torobayo | Kunstmann Gran Torobayo |
| K. Lager Blanc | Kunstmann Lager Blanc |
| K. Sin Alcohol | Kunstmann Sin Alcohol |
| K. Torobayo | Kunstmann Torobayo |
| K. VPL | Kunstmann VPL |
| Kunstman VPL Lata | Kunstmann VPL Lata |
| Mineral con Gas | Agua Mineral con Gas 600ml |
| Mineral sin Gas | Agua Mineral sin Gas 600ml |
| Coca Cola 1,5 | Coca Cola 1.5L |
| Crush 1,5 | Crush 1.5L |
| Ginger 1,5 | Ginger Ale 1.5L |
| Kem 1,5 | Kem 1.5L |
| Pepsi 1,5 | Pepsi 1.5L |
| Tonica 1,5 | Tónica 1.5L |
| Agua Mineral 1,5 | Agua Mineral 1.5L |
| Coca Cola Zero 1,5 | Coca Cola Zero 1.5L |
| Nectar Naranja | Néctar Naranja 1.5L |
| Nectar Piña | Néctar Piña 1.5L |
| Pepsi Zero 1,5 | Pepsi Zero 1.5L |
| Sprite 1,5 | Sprite 1.5L |
| Stolichnaya L | Stolichnaya L |
| Ramazzotti Rosato | Ramazzotti Rosato |

## Productos en Excel sin equivalente en DB

- **Espumante ricadona** — se creará o se ignora (a confirmar)
- **Havana Blanco 7años L** — se creará o se ignora (a confirmar)
- **Havana Reserva** (750ml, solo 1 unidad en Excel) — ya existe en DB

## Ejecución

Script Python ejecutado con `code--exec` que genera los UPDATEs y los aplica via psql. Se genera un reporte de cambios para verificación.

