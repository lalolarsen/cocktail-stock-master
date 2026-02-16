CREATE OR REPLACE FUNCTION public.validate_product_cost()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only enforce cost validation when cost_per_unit is explicitly being changed
  -- Allow metadata updates (name, category, subcategory, unit, capacity_ml) without cost constraints
  IF TG_OP = 'UPDATE' AND OLD.cost_per_unit IS NOT DISTINCT FROM NEW.cost_per_unit THEN
    RETURN NEW;
  END IF;

  -- For inserts or when cost is actually changing, allow NULL/0 (will be set on first stock intake)
  IF NEW.cost_per_unit IS NOT NULL AND NEW.cost_per_unit < 0 THEN
    RAISE EXCEPTION 'El costo por unidad no puede ser negativo. Valor recibido: %', NEW.cost_per_unit::text;
  END IF;

  RETURN NEW;
END;
$function$;