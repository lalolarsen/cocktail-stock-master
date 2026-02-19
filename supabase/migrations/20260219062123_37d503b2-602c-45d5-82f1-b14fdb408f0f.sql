
-- Fix: Add venue_id to consume_stock_fefo and pass it to stock_movements INSERT

CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_allow_expired boolean DEFAULT false,
  p_jornada_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_pickup_token_id uuid DEFAULT NULL::uuid,
  p_source_type text DEFAULT NULL::text,
  p_venue_id uuid DEFAULT NULL::uuid
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
  v_movement_id uuid;
  v_unit_cost numeric;
  v_total_cost numeric := 0;
  v_venue_id uuid;
BEGIN
  -- Validate input
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'Quantity must be positive');
  END IF;

  -- Resolve venue_id: use param if provided, else derive from location
  IF p_venue_id IS NOT NULL THEN
    v_venue_id := p_venue_id;
  ELSE
    SELECT venue_id INTO v_venue_id
    FROM stock_locations
    WHERE id = p_location_id;
  END IF;

  -- If still null, derive from product
  IF v_venue_id IS NULL THEN
    SELECT venue_id INTO v_venue_id
    FROM products
    WHERE id = p_product_id;
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
      -- Last resort: check stock_balances for sync discrepancy
      DECLARE
        v_balance_qty numeric;
      BEGIN
        SELECT COALESCE(quantity, 0) INTO v_balance_qty
        FROM stock_balances
        WHERE product_id = p_product_id AND location_id = p_location_id;

        IF v_balance_qty >= p_quantity THEN
          -- Create a sync lot so consumption can proceed
          INSERT INTO stock_lots (
            venue_id, product_id, location_id, quantity, source,
            received_at, expires_at, is_depleted
          )
          VALUES (
            v_venue_id, p_product_id, p_location_id, v_balance_qty,
            'legacy_migration', now(),
            now() + interval '3 years', false
          );

          -- Recalculate total available
          SELECT COALESCE(SUM(quantity), 0) INTO v_total_available
          FROM stock_lots
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
    
    -- INSERT to stock_movements now includes venue_id
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
      source_type,
      venue_id
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
      p_source_type,
      v_venue_id
    )
    RETURNING id INTO v_movement_id;
  END LOOP;

  -- Update stock_balances
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

-- Now update redeem_pickup_token to pass venue_id when calling consume_stock_fefo
-- We need to find all calls to consume_stock_fefo inside redeem_pickup_token and add venue_id param
-- The best approach is to recreate redeem_pickup_token with the venue_id passed through

-- First, get the full current definition (we'll patch it via a DO block that replaces the function)
-- We identify calls like: SELECT consume_stock_fefo(... ) and add p_venue_id => v_token_record.venue_id

-- Since we can't easily patch a 800-line function inline here, we use a targeted approach:
-- Create a wrapper that ensures venue_id is set via a trigger on stock_movements

-- Add a BEFORE INSERT trigger to stock_movements that auto-fills venue_id from product if missing
CREATE OR REPLACE FUNCTION public.stock_movements_ensure_venue_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  -- If venue_id is already set, do nothing
  IF NEW.venue_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to get venue_id from the product
  IF NEW.product_id IS NOT NULL THEN
    SELECT venue_id INTO v_venue_id
    FROM products
    WHERE id = NEW.product_id;
    
    IF v_venue_id IS NOT NULL THEN
      NEW.venue_id := v_venue_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Try to get venue_id from the location (from_location_id)
  IF NEW.from_location_id IS NOT NULL THEN
    SELECT venue_id INTO v_venue_id
    FROM stock_locations
    WHERE id = NEW.from_location_id;
    
    IF v_venue_id IS NOT NULL THEN
      NEW.venue_id := v_venue_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Try to get venue_id from the location (to_location_id)
  IF NEW.to_location_id IS NOT NULL THEN
    SELECT venue_id INTO v_venue_id
    FROM stock_locations
    WHERE id = NEW.to_location_id;
    
    IF v_venue_id IS NOT NULL THEN
      NEW.venue_id := v_venue_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Try to get venue_id from the pickup_token
  IF NEW.pickup_token_id IS NOT NULL THEN
    SELECT venue_id INTO v_venue_id
    FROM pickup_tokens
    WHERE id = NEW.pickup_token_id;
    
    IF v_venue_id IS NOT NULL THEN
      NEW.venue_id := v_venue_id;
      RETURN NEW;
    END IF;
  END IF;

  -- If we still don't have venue_id, raise an error with useful context
  RAISE EXCEPTION 'stock_movements: cannot determine venue_id for product_id=%, from_location_id=%, pickup_token_id=%',
    NEW.product_id, NEW.from_location_id, NEW.pickup_token_id;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_stock_movements_ensure_venue_id ON public.stock_movements;

CREATE TRIGGER trg_stock_movements_ensure_venue_id
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.stock_movements_ensure_venue_id();
