CREATE OR REPLACE FUNCTION public.check_pos_location_type()
RETURNS TRIGGER AS $$
BEGIN
  -- Only POS types that move physical stock must point to a bar location
  IF NEW.pos_type IN ('alcohol_sales', 'bar_redemption') THEN
    IF NEW.location_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.stock_locations
      WHERE id = NEW.location_id AND type = 'bar'
    ) THEN
      RAISE EXCEPTION 'POS terminal must be linked to a bar location';
    END IF;
  ELSIF NEW.location_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.stock_locations WHERE id = NEW.location_id
    ) THEN
      RAISE EXCEPTION 'Invalid location for POS terminal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;