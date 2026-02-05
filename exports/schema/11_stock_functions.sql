-- ============================================
-- DiStock Database Schema Export
-- Part 11: Stock Management Functions
-- ============================================

-- ============================================
-- ADD STOCK LOT
-- ============================================

CREATE OR REPLACE FUNCTION public.add_stock_lot(
  p_venue_id UUID,
  p_product_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_expires_at DATE,
  p_source TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lot_id UUID;
BEGIN
  INSERT INTO stock_lots (venue_id, product_id, location_id, quantity, expires_at, source)
  VALUES (p_venue_id, p_product_id, p_location_id, p_quantity, p_expires_at, p_source)
  RETURNING id INTO v_lot_id;

  -- Update aggregated balance
  INSERT INTO stock_balances (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = stock_balances.quantity + p_quantity, updated_at = now();

  -- Create stock movement
  INSERT INTO stock_movements (product_id, movement_type, quantity, to_location_id, stock_lot_id, notes)
  VALUES (p_product_id, 'entrada', p_quantity, p_location_id, v_lot_id, 'New lot: ' || p_source);

  RETURN jsonb_build_object('success', true, 'lot_id', v_lot_id);
END;
$function$;

-- ============================================
-- CONSUME STOCK FEFO (First Expired First Out)
-- ============================================

CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_jornada_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_pickup_token_id UUID DEFAULT NULL,
  p_source_type TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_lot RECORD;
  v_consumed_from_lot NUMERIC;
  v_lots_consumed JSONB := '[]'::jsonb;
  v_unit_cost NUMERIC;
  v_movement_id UUID;
BEGIN
  -- Get current product cost for movement tracking
  SELECT cost_per_unit INTO v_unit_cost FROM products WHERE id = p_product_id;
  
  -- Consume from lots in FEFO order (First Expired First Out)
  FOR v_lot IN
    SELECT id, quantity, expires_at
    FROM stock_lots
    WHERE product_id = p_product_id
      AND location_id = p_location_id
      AND quantity > 0
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    
    v_consumed_from_lot := LEAST(v_lot.quantity, v_remaining);
    
    -- Deduct from lot
    UPDATE stock_lots
    SET quantity = quantity - v_consumed_from_lot
    WHERE id = v_lot.id;
    
    v_lots_consumed := v_lots_consumed || jsonb_build_object(
      'lot_id', v_lot.id,
      'quantity', v_consumed_from_lot,
      'expires_at', v_lot.expires_at
    );
    
    v_remaining := v_remaining - v_consumed_from_lot;
  END LOOP;
  
  -- Check if we could consume everything
  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_STOCK',
      'required', p_quantity,
      'available', p_quantity - v_remaining
    );
  END IF;
  
  -- Update aggregated balance
  UPDATE stock_balances
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE product_id = p_product_id AND location_id = p_location_id;
  
  -- Update product's current_stock
  UPDATE products
  SET current_stock = current_stock - p_quantity, updated_at = now()
  WHERE id = p_product_id;
  
  -- Log stock movement
  INSERT INTO stock_movements (
    product_id,
    movement_type,
    quantity,
    from_location_id,
    jornada_id,
    pickup_token_id,
    unit_cost,
    notes,
    source_type
  ) VALUES (
    p_product_id,
    'salida',
    p_quantity,
    p_location_id,
    p_jornada_id,
    p_pickup_token_id,
    v_unit_cost,
    p_notes,
    p_source_type
  )
  RETURNING id INTO v_movement_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'consumed', p_quantity,
    'lots', v_lots_consumed,
    'movement_id', v_movement_id
  );
END;
$function$;

-- ============================================
-- APPLY REPLENISHMENT PLAN
-- ============================================

CREATE OR REPLACE FUNCTION public.apply_replenishment_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan replenishment_plans%ROWTYPE;
  v_warehouse_id UUID;
  v_item RECORD;
  v_current_balance NUMERIC;
  v_insufficient_items JSONB := '[]'::JSONB;
  v_items_moved INT := 0;
  v_bars_affected UUID[] := '{}';
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Check admin permission
  IF NOT has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized - admin only');
  END IF;
  
  -- Get and lock the plan
  SELECT * INTO v_plan FROM replenishment_plans WHERE id = p_plan_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan not found');
  END IF;
  
  IF v_plan.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan is not in draft status');
  END IF;
  
  -- Get warehouse ID
  SELECT id INTO v_warehouse_id FROM stock_locations WHERE type = 'warehouse' LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse location not found');
  END IF;
  
  -- Check stock availability for all items
  FOR v_item IN
    SELECT rpi.product_id, p.name as product_name, SUM(rpi.quantity) as total_qty
    FROM replenishment_plan_items rpi
    JOIN products p ON p.id = rpi.product_id
    WHERE rpi.replenishment_plan_id = p_plan_id
    GROUP BY rpi.product_id, p.name
  LOOP
    SELECT COALESCE(sb.quantity, 0) INTO v_current_balance
    FROM stock_balances sb
    WHERE sb.product_id = v_item.product_id AND sb.location_id = v_warehouse_id;
    
    IF COALESCE(v_current_balance, 0) < v_item.total_qty THEN
      v_insufficient_items := v_insufficient_items || jsonb_build_object(
        'product_id', v_item.product_id,
        'product_name', v_item.product_name,
        'required', v_item.total_qty,
        'available', COALESCE(v_current_balance, 0)
      );
    END IF;
  END LOOP;
  
  IF jsonb_array_length(v_insufficient_items) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient warehouse stock',
      'insufficient_items', v_insufficient_items
    );
  END IF;
  
  -- Apply transfers
  FOR v_item IN
    SELECT rpi.to_location_id, rpi.product_id, rpi.quantity
    FROM replenishment_plan_items rpi
    WHERE rpi.replenishment_plan_id = p_plan_id
  LOOP
    -- Deduct from warehouse
    UPDATE stock_balances
    SET quantity = quantity - v_item.quantity, updated_at = now()
    WHERE product_id = v_item.product_id AND location_id = v_warehouse_id;
    
    -- Add to bar
    INSERT INTO stock_balances (product_id, location_id, quantity)
    VALUES (v_item.product_id, v_item.to_location_id, v_item.quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = stock_balances.quantity + v_item.quantity, updated_at = now();
    
    -- Log movement
    INSERT INTO stock_movements (product_id, movement_type, quantity, from_location_id, to_location_id, jornada_id, notes)
    VALUES (v_item.product_id, 'salida', v_item.quantity, v_warehouse_id, v_item.to_location_id, v_plan.jornada_id, 'Replenishment: ' || v_plan.name);
    
    v_items_moved := v_items_moved + 1;
    
    IF NOT v_item.to_location_id = ANY(v_bars_affected) THEN
      v_bars_affected := array_append(v_bars_affected, v_item.to_location_id);
    END IF;
  END LOOP;
  
  -- Mark plan as applied
  UPDATE replenishment_plans
  SET status = 'applied', applied_at = now(), updated_at = now()
  WHERE id = p_plan_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'items_moved', v_items_moved,
    'bars_affected', array_length(v_bars_affected, 1),
    'applied_at', now()
  );
END;
$function$;

-- ============================================
-- CHECK LOW STOCK (Trigger function)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  unit_display TEXT;
BEGIN
  CASE NEW.category
    WHEN 'ml' THEN unit_display := 'ml';
    WHEN 'gramos' THEN unit_display := 'g';
    WHEN 'unidades' THEN unit_display := 'unidades';
    ELSE unit_display := NEW.unit;
  END CASE;

  IF NEW.current_stock <= NEW.minimum_stock THEN
    INSERT INTO stock_alerts (product_id, alert_type, message)
    VALUES (
      NEW.id,
      'low_stock',
      'Stock bajo: ' || NEW.name || ' tiene solo ' || NEW.current_stock || ' ' || unit_display
    );
  END IF;
  RETURN NEW;
END;
$function$;
