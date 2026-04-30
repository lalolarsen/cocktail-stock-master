
-- 1. Función helper: upsert de stock_balance
CREATE OR REPLACE FUNCTION public.upsert_stock_balance(
  p_venue_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_delta numeric,
  p_set_absolute boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_location_id IS NULL OR p_product_id IS NULL THEN
    RETURN;
  END IF;

  IF p_set_absolute THEN
    INSERT INTO public.stock_balances (venue_id, product_id, location_id, quantity)
    VALUES (p_venue_id, p_product_id, p_location_id, p_delta)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
  ELSE
    INSERT INTO public.stock_balances (venue_id, product_id, location_id, quantity)
    VALUES (p_venue_id, p_product_id, p_location_id, GREATEST(p_delta, 0))
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = stock_balances.quantity + p_delta, updated_at = now();
  END IF;
END;
$$;

-- 2. Asegurar índice único requerido por ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='stock_balances_product_location_uniq'
  ) THEN
    -- Limpiar duplicados antes de crear el índice único
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id, location_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) AS rn
      FROM public.stock_balances
    )
    DELETE FROM public.stock_balances WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

    CREATE UNIQUE INDEX stock_balances_product_location_uniq
      ON public.stock_balances (product_id, location_id);
  END IF;
END $$;

-- 3. Reescribir el trigger principal
CREATE OR REPLACE FUNCTION public.update_stock_on_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  -- Aplicar al stock_balance según tipo de movimiento
  CASE NEW.movement_type
    WHEN 'entrada', 'compra' THEN
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.to_location_id, NEW.quantity, false);
    WHEN 'salida' THEN
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.from_location_id, -NEW.quantity, false);
    WHEN 'waste' THEN
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.from_location_id, -NEW.quantity, false);
    WHEN 'transfer_out' THEN
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.from_location_id, -NEW.quantity, false);
    WHEN 'transfer_in' THEN
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.to_location_id, NEW.quantity, false);
    WHEN 'ajuste' THEN
      -- Setea el balance a NEW.quantity (valor absoluto en from_location_id)
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.from_location_id, NEW.quantity, true);
    WHEN 'reconciliation' THEN
      -- Aplica delta firmado en from_location_id (positivo o negativo)
      PERFORM public.upsert_stock_balance(NEW.venue_id, NEW.product_id, NEW.from_location_id, NEW.quantity, false);
    ELSE
      -- Tipo desconocido: no hace nada al balance
      NULL;
  END CASE;

  -- Recalcular products.current_stock como suma de balances del producto (fuente derivada)
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.stock_balances
  WHERE product_id = NEW.product_id;

  UPDATE public.products
  SET current_stock = v_total, updated_at = now()
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;
