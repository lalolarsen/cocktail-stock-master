
-- CORRECCIÓN DEFINITIVA de consume_stock_fefo:
-- Para productos BOTELLA (capacity_ml > 0): unit_cost debe guardarse como cost_per_ml
-- (cost_per_unit / capacity_ml), así qty_ml * unit_cost_per_ml = COGS correcto
-- Para productos UNITARIO: unit_cost = cost_per_unit (sin cambio)
-- Esto hace que el cálculo simple qty * unit_cost funcione en TODOS los sistemas

CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_source_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_jornada_id UUID DEFAULT NULL,
  p_bartender_id UUID DEFAULT NULL,
  p_allow_expired BOOLEAN DEFAULT FALSE,
  p_venue_id UUID DEFAULT NULL,
  p_pickup_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining numeric := p_quantity;
  v_lot record;
  v_deducted numeric;
  v_consumed_lots jsonb := '[]'::jsonb;
  v_total_available numeric;
  v_movement_id uuid;
  v_unit_cost numeric;          -- costo por unidad de medida almacenada (ml o unidad)
  v_cost_per_bottle numeric;    -- costo por botella completa (de products.cost_per_unit)
  v_capacity_ml numeric;        -- ml por botella (de products.capacity_ml)
  v_total_cost numeric := 0;
  v_venue_id uuid;
BEGIN
  -- Validate input
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'Quantity must be positive');
  END IF;

  -- Resolve venue_id
  IF p_venue_id IS NOT NULL THEN
    v_venue_id := p_venue_id;
  ELSE
    SELECT venue_id INTO v_venue_id FROM public.stock_locations WHERE id = p_location_id;
  END IF;
  IF v_venue_id IS NULL THEN
    SELECT venue_id INTO v_venue_id FROM public.products WHERE id = p_product_id;
  END IF;

  -- Get product cost info
  -- cost_per_unit = costo por BOTELLA COMPLETA (para botellas) o por UNIDAD (para unitarios)
  SELECT cost_per_unit, COALESCE(capacity_ml, 0)
  INTO v_cost_per_bottle, v_capacity_ml
  FROM public.products
  WHERE id = p_product_id;

  -- Normalizar unit_cost: para botellas → cost_per_ml; para unitarios → cost_per_unit
  -- Así: qty_almacenada * unit_cost = COGS correcto en TODOS los casos
  IF v_capacity_ml > 0 THEN
    v_unit_cost := COALESCE(v_cost_per_bottle, 0) / v_capacity_ml;
  ELSE
    v_unit_cost := COALESCE(v_cost_per_bottle, 0);
  END IF;

  -- Check total available
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
  FROM public.stock_lots
  WHERE product_id = p_product_id
    AND location_id = p_location_id
    AND quantity > 0
    AND is_depleted = false
    AND (p_allow_expired OR expires_at >= CURRENT_DATE);

  IF v_total_available < p_quantity AND NOT p_allow_expired THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
    FROM public.stock_lots
    WHERE product_id = p_product_id
      AND location_id = p_location_id
      AND quantity > 0
      AND is_depleted = false;

    IF v_total_available >= p_quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'EXPIRED_STOCK_ONLY',
        'message', 'Available stock is expired',
        'available', v_total_available
      );
    ELSE
      DECLARE
        v_balance_qty numeric;
      BEGIN
        SELECT COALESCE(quantity, 0) INTO v_balance_qty
        FROM public.stock_balances
        WHERE product_id = p_product_id AND location_id = p_location_id;

        IF v_balance_qty >= p_quantity THEN
          INSERT INTO public.stock_lots (
            venue_id, product_id, location_id, quantity, source,
            received_at, expires_at, is_depleted
          )
          VALUES (
            v_venue_id, p_product_id, p_location_id, v_balance_qty,
            'legacy_migration', now(),
            now() + interval '3 years', false
          );

          SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
          FROM public.stock_lots
          WHERE product_id = p_product_id
            AND location_id = p_location_id
            AND quantity > 0
            AND is_depleted = false;
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_STOCK',
            'message', 'Not enough stock available',
            'available', v_balance_qty,
            'requested', p_quantity
          );
        END IF;
      END;
    END IF;
  END IF;

  -- FEFO consumption loop
  FOR v_lot IN
    SELECT id, quantity, expires_at
    FROM public.stock_lots
    WHERE product_id = p_product_id
      AND location_id = p_location_id
      AND quantity > 0
      AND is_depleted = false
      AND (p_allow_expired OR expires_at >= CURRENT_DATE)
    ORDER BY expires_at ASC, received_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deducted := LEAST(v_lot.quantity, v_remaining);
    v_remaining := v_remaining - v_deducted;

    v_total_cost := v_total_cost + (v_deducted * v_unit_cost);

    UPDATE public.stock_lots
    SET
      quantity = quantity - v_deducted,
      is_depleted = (quantity - v_deducted <= 0),
      updated_at = now()
    WHERE id = v_lot.id;

    v_consumed_lots := v_consumed_lots || jsonb_build_object(
      'lot_id', v_lot.id,
      'quantity', v_deducted,
      'expires_at', v_lot.expires_at,
      'unit_cost', v_unit_cost
    );

    INSERT INTO public.stock_movements (
      product_id,
      movement_type,
      quantity,
      unit_cost,
      source_type,
      reference_id,
      location_id,
      jornada_id,
      bartender_id,
      venue_id,
      pickup_token_id,
      created_at
    ) VALUES (
      p_product_id,
      'salida',
      -v_deducted,
      v_unit_cost,   -- ← normalizado: cost_per_ml para botellas, cost_per_unit para unitarios
      p_source_type,
      p_reference_id,
      p_location_id,
      p_jornada_id,
      COALESCE(p_bartender_id, auth.uid()),
      v_venue_id,
      p_pickup_token_id,
      now()
    )
    RETURNING id INTO v_movement_id;

  END LOOP;

  -- Update stock_balances
  INSERT INTO public.stock_balances (product_id, location_id, quantity, venue_id)
  VALUES (p_product_id, p_location_id, 0, v_venue_id)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    quantity = public.stock_balances.quantity - (p_quantity - v_remaining),
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'consumed', p_quantity - v_remaining,
    'unit_cost', v_unit_cost,
    'total_cost', v_total_cost,
    'consumed_lots', v_consumed_lots
  );
END;
$$;
