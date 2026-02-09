-- Enforce cost_per_unit > 0 for products (Ley de Costos estricta)
-- This migration:
-- 1. Updates existing products with cost <= 0 to be inactive
-- 2. Adds a CHECK constraint to enforce cost > 0

-- Step 1: Mark products with invalid cost as inactive for sales
UPDATE products 
SET is_active_in_sales = false 
WHERE cost_per_unit IS NULL OR cost_per_unit < 1;

-- Step 2: Set a default cost of 1 for NULL values (to satisfy constraint)
UPDATE products 
SET cost_per_unit = 1 
WHERE cost_per_unit IS NULL;

-- Step 3: Add CHECK constraint to enforce cost >= 1
-- Using a trigger instead of CHECK for better error messages
CREATE OR REPLACE FUNCTION validate_product_cost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cost_per_unit IS NULL OR NEW.cost_per_unit < 1 THEN
    RAISE EXCEPTION 'El costo por unidad debe ser mayor o igual a $1. Valor recibido: %', COALESCE(NEW.cost_per_unit::text, 'NULL');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_product_cost ON products;
CREATE TRIGGER enforce_product_cost
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION validate_product_cost();

-- Step 4: Create a function to check if a product is sellable (has valid cost)
CREATE OR REPLACE FUNCTION is_product_sellable(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_cost NUMERIC;
  v_active BOOLEAN;
BEGIN
  SELECT cost_per_unit, is_active_in_sales 
  INTO v_cost, v_active
  FROM products 
  WHERE id = p_product_id;
  
  RETURN v_active = true AND v_cost >= 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_product_sellable IS 'Verifica si un producto puede venderse (costo >= $1 y activo)';
COMMENT ON FUNCTION validate_product_cost IS 'Trigger: Valida que cost_per_unit >= $1 en productos';