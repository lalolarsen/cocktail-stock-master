
-- Corregir product "Ron Havana 3 Años" que tiene unit=ml pero capacity_ml=NULL
-- El stock está en ml y cost_per_unit=15 es por botella -> debe ser clasificado como botella
-- Asignamos capacity_ml=750 (botella estándar de ron) para que isBottle=true

UPDATE products
SET capacity_ml = 750
WHERE id = 'ec4b571b-6d6f-4e2c-89f8-8001463a6974'
  AND capacity_ml IS NULL
  AND unit = 'ml';

-- Verificar si hay otros productos con unit=ml, capacity_ml=NULL que deberían ser botellas
-- (Mostrar para auditoría - no modificar sin revisar)
-- SELECT id, name, unit, capacity_ml, cost_per_unit FROM products WHERE unit = 'ml' AND capacity_ml IS NULL;
