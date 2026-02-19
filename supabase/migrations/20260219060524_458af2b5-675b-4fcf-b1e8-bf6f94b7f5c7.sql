
-- Fix 1: Create missing stock_lots for products with stock_balances but no active lots
INSERT INTO stock_lots (
  venue_id,
  product_id,
  location_id,
  quantity,
  is_depleted,
  expires_at,
  received_at,
  source
)
SELECT
  sl.venue_id,
  sb.product_id,
  sb.location_id,
  sb.quantity,
  false,
  (CURRENT_DATE + INTERVAL '2 years')::date,
  now(),
  'legacy_migration'
FROM stock_balances sb
JOIN stock_locations sl ON sl.id = sb.location_id
WHERE sb.quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM stock_lots lots
    WHERE lots.product_id = sb.product_id
      AND lots.location_id = sb.location_id
      AND lots.is_depleted = false
      AND lots.quantity > 0
  );

-- Fix 2: Update consume_stock_fefo to auto-create a legacy_migration lot from stock_balances
-- if no lots exist but balance shows stock — prevents false INSUFFICIENT_STOCK on redemption
CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_jornada_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_pickup_token_id uuid DEFAULT NULL,
  p_source_type text DEFAULT 'manual',
  p_allow_expired boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining numeric := p_quantity;
  v_lot record;
  v_deducted numeric;
  v_consumed_lots jsonb := '[]'::jsonb;
  v_total_available numeric;
  v_movement_id uuid;
  v_unit_cost numeric;
  v_total_cost numeric := 0;
  v_balance_qty numeric;
  v_venue_id uuid;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'Quantity must be positive');
  END IF;

  SELECT cost_per_unit INTO v_unit_cost FROM products WHERE id = p_product_id;
  SELECT venue_id INTO v_venue_id FROM stock_locations WHERE id = p_location_id;

  -- Check lots (non-expired first)
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
  FROM stock_lots
  WHERE product_id = p_product_id
    AND location_id = p_location_id
    AND quantity > 0
    AND is_depleted = false
    AND (p_allow_expired OR expires_at >= CURRENT_DATE);

  IF v_total_available < p_quantity THEN
    -- Check all lots including expired
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
    FROM stock_lots
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
      -- Fallback: check stock_balances directly (stock entered without lots)
      SELECT COALESCE(quantity, 0) INTO v_balance_qty
      FROM stock_balances
      WHERE product_id = p_product_id AND location_id = p_location_id;

      IF v_balance_qty >= p_quantity THEN
        -- Auto-create a sync lot so consumption can proceed
        INSERT INTO stock_lots (venue_id, product_id, location_id, quantity, is_depleted, expires_at, received_at, source)
        VALUES (
          v_venue_id,
          p_product_id,
          p_location_id,
          v_balance_qty,
          false,
          (CURRENT_DATE + INTERVAL '2 years')::date,
          now(),
          'legacy_migration'
        );
        -- Recalculate available after inserting sync lot
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
        FROM stock_lots
        WHERE product_id = p_product_id
          AND location_id = p_location_id
          AND quantity > 0
          AND is_depleted = false
          AND (p_allow_expired OR expires_at >= CURRENT_DATE);
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'error', 'INSUFFICIENT_STOCK',
          'message', 'Not enough stock available',
          'available', COALESCE(v_balance_qty, 0),
          'requested', p_quantity
        );
      END IF;
    END IF;
  END IF;

  -- FEFO consumption loop
  FOR v_lot IN
    SELECT id, quantity, expires_at
    FROM stock_lots
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

    IF v_unit_cost IS NOT NULL THEN
      v_total_cost := v_total_cost + (v_deducted * v_unit_cost);
    END IF;

    UPDATE stock_lots
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

    INSERT INTO stock_movements (
      product_id,
      movement_type,
      quantity,
      from_location_id,
      jornada_id,
      notes,
      pickup_token_id,
      stock_lot_id,
      unit_cost,
      source_type
    ) VALUES (
      p_product_id,
      'salida',
      v_deducted,
      p_location_id,
      p_jornada_id,
      COALESCE(p_notes, 'FEFO consumption'),
      p_pickup_token_id,
      v_lot.id,
      v_unit_cost,
      p_source_type
    )
    RETURNING id INTO v_movement_id;
  END LOOP;

  -- Keep stock_balances in sync
  UPDATE stock_balances
  SET
    quantity = quantity - p_quantity,
    updated_at = now()
  WHERE product_id = p_product_id
    AND location_id = p_location_id;

  RETURN jsonb_build_object(
    'success', true,
    'consumed', p_quantity,
    'lots', v_consumed_lots,
    'total_cost', v_total_cost
  );
END;
$$;
