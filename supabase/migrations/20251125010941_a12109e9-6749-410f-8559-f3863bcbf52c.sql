-- Update the check_low_stock function to display correct units based on category
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  unit_display TEXT;
BEGIN
  -- Determine the correct unit display based on category
  CASE NEW.category
    WHEN 'ml' THEN unit_display := 'ml';
    WHEN 'gramos' THEN unit_display := 'g';
    WHEN 'unidades' THEN unit_display := 'unidades';
    ELSE unit_display := NEW.unit;
  END CASE;

  IF NEW.current_stock <= NEW.minimum_stock THEN
    INSERT INTO public.stock_alerts (product_id, alert_type, message)
    VALUES (
      NEW.id,
      'low_stock',
      'Stock bajo: ' || NEW.name || ' tiene solo ' || NEW.current_stock || ' ' || unit_display
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;