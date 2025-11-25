-- Corregir la función para establecer el search_path
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;