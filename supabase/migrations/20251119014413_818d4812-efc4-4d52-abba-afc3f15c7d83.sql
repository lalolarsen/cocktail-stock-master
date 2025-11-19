-- Fix function search_path for check_low_stock
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_stock <= NEW.minimum_stock THEN
    INSERT INTO public.stock_alerts (product_id, alert_type, message)
    VALUES (
      NEW.id,
      'low_stock',
      'Stock bajo: ' || NEW.name || ' tiene solo ' || NEW.current_stock || ' ' || NEW.unit
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Fix function search_path for update_stock_on_movement
CREATE OR REPLACE FUNCTION update_stock_on_movement()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type = 'entrada' OR NEW.movement_type = 'compra' THEN
    UPDATE public.products
    SET current_stock = current_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'salida' THEN
    UPDATE public.products
    SET current_stock = current_stock - NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'ajuste' THEN
    UPDATE public.products
    SET current_stock = NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;