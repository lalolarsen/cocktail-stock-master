-- Drop the existing function with exact signature
DROP FUNCTION IF EXISTS public.consume_stock_fefo(uuid, uuid, numeric, boolean, uuid, text, uuid);

-- Recreate with the new signature including source_type
CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_allow_expired boolean DEFAULT false,
  p_jornada_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_pickup_token_id uuid DEFAULT NULL,
  p_source_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_quantity;
  v_lot record;
  v_deducted numeric;
  v_consumed_lots jsonb := '[]'::jsonb;
  v_total_available numeric;
  v_expired_only boolean := false;
  v_movement_id uuid;
  v_unit_cost numeric;
  v_total_cost numeric := 0;
BEGIN
  -- Validate input
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'Quantity must be positive');
  END IF;

  -- Get the product unit cost
  SELECT cost_per_unit INTO v_unit_cost
  FROM products
  WHERE id = p_product_id;

  -- Check total available (non-expired first)
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
  FROM stock_lots
  WHERE product_id = p_product_id
    AND location_id = p_location_id
    AND quantity > 0
    AND is_depleted = false
    AND (p_allow_expired OR expires_at >= CURRENT_DATE);

  -- If not enough non-expired, check if there's expired stock
  IF v_total_available < p_quantity AND NOT p_allow_expired THEN
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
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'INSUFFICIENT_STOCK',
        'message', 'Not enough stock available',
        'available', v_total_available,
        'requested', p_quantity
      );
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
    
    -- Calculate how much to deduct from this lot
    v_deducted := LEAST(v_lot.quantity, v_remaining);
    v_remaining := v_remaining - v_deducted;
    
    -- Accumulate total cost
    IF v_unit_cost IS NOT NULL THEN
      v_total_cost := v_total_cost + (v_deducted * v_unit_cost);
    END IF;
    
    -- Update the lot
    UPDATE stock_lots
    SET 
      quantity = quantity - v_deducted,
      is_depleted = (quantity - v_deducted <= 0),
      updated_at = now()
    WHERE id = v_lot.id;
    
    -- Record the consumption
    v_consumed_lots := v_consumed_lots || jsonb_build_object(
      'lot_id', v_lot.id,
      'quantity', v_deducted,
      'expires_at', v_lot.expires_at,
      'unit_cost', v_unit_cost
    );
    
    -- Create stock movement for this lot with unit_cost and source_type
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

  -- Update stock_balances to keep aggregated view in sync
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

COMMENT ON FUNCTION public.consume_stock_fefo IS 'Consume stock using FEFO method, tracking unit cost and source type for cost of sales calculation';