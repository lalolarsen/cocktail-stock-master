-- Crear función para registrar movimientos de stock automáticamente cuando se hace una venta
CREATE OR REPLACE FUNCTION register_stock_movement_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_cocktail_id uuid;
  v_ingredient record;
BEGIN
  -- Obtener el cocktail_id del sale_item
  v_cocktail_id := NEW.cocktail_id;
  
  -- Por cada ingrediente del cocktail, registrar un movimiento de salida
  FOR v_ingredient IN 
    SELECT ci.product_id, ci.quantity
    FROM cocktail_ingredients ci
    WHERE ci.cocktail_id = v_cocktail_id
  LOOP
    INSERT INTO stock_movements (
      product_id,
      quantity,
      movement_type,
      notes
    ) VALUES (
      v_ingredient.product_id,
      v_ingredient.quantity * NEW.quantity, -- Multiplicar por la cantidad de cocktails vendidos
      'salida',
      'Venta automática - Sale #' || NEW.sale_id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger que se ejecuta después de insertar un sale_item
CREATE TRIGGER trigger_register_stock_movement
AFTER INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION register_stock_movement_on_sale();

-- Registrar movimientos históricos para las ventas existentes
INSERT INTO stock_movements (product_id, quantity, movement_type, notes, created_at)
SELECT 
  ci.product_id,
  ci.quantity * si.quantity as total_quantity,
  'salida' as movement_type,
  'Venta histórica - Sale #' || si.sale_id as notes,
  si.created_at
FROM sale_items si
JOIN cocktail_ingredients ci ON ci.cocktail_id = si.cocktail_id
JOIN sales s ON s.id = si.sale_id
WHERE s.is_cancelled = false
AND NOT EXISTS (
  SELECT 1 FROM stock_movements sm 
  WHERE sm.notes LIKE '%Sale #' || si.sale_id || '%'
);