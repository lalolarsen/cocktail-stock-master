
-- ============================================
-- STOCK LOTS TABLE - Expiration-aware inventory
-- ============================================

-- Create stock_lots table for batch/lot tracking with expiration
CREATE TABLE public.stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  expires_at date NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  is_depleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT positive_quantity CHECK (quantity >= 0),
  CONSTRAINT valid_source CHECK (source IN ('manual', 'excel', 'transfer', 'invoice', 'demo', 'legacy_migration'))
);

-- Indexes for efficient queries
CREATE INDEX idx_stock_lots_venue_product_location ON public.stock_lots(venue_id, product_id, location_id);
CREATE INDEX idx_stock_lots_venue_expires ON public.stock_lots(venue_id, expires_at);
CREATE INDEX idx_stock_lots_fefo ON public.stock_lots(product_id, location_id, expires_at ASC, received_at ASC) WHERE quantity > 0 AND is_depleted = false;

-- Enable RLS
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage stock lots"
  ON public.stock_lots FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view stock lots"
  ON public.stock_lots FOR SELECT
  USING (has_role(auth.uid(), 'gerencia'::app_role));

CREATE POLICY "Everyone can view stock lots"
  ON public.stock_lots FOR SELECT
  USING (true);

-- Add stock_lot_id to stock_movements for audit trail
ALTER TABLE public.stock_movements 
  ADD COLUMN stock_lot_id uuid REFERENCES public.stock_lots(id);

CREATE INDEX idx_stock_movements_lot ON public.stock_movements(stock_lot_id);

-- ============================================
-- FEFO CONSUMPTION FUNCTION
-- ============================================

-- Function to consume stock using FEFO (First Expired, First Out)
CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_allow_expired boolean DEFAULT false,
  p_jornada_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_pickup_token_id uuid DEFAULT NULL
) RETURNS jsonb
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
BEGIN
  -- Validate input
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'Quantity must be positive');
  END IF;

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
    -- Check if including expired would be enough
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
      'expires_at', v_lot.expires_at
    );
    
    -- Create stock movement for this lot
    INSERT INTO stock_movements (
      product_id,
      movement_type,
      quantity,
      from_location_id,
      jornada_id,
      notes,
      pickup_token_id,
      stock_lot_id
    ) VALUES (
      p_product_id,
      'salida',
      v_deducted,
      p_location_id,
      p_jornada_id,
      COALESCE(p_notes, 'FEFO consumption'),
      p_pickup_token_id,
      v_lot.id
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
    'lots', v_consumed_lots
  );
END;
$$;

-- ============================================
-- FEFO TRANSFER FUNCTION
-- ============================================

-- Function to transfer stock between locations using FEFO
CREATE OR REPLACE FUNCTION public.transfer_stock_fefo(
  p_product_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity numeric,
  p_transferred_by uuid,
  p_jornada_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_quantity;
  v_lot record;
  v_deducted numeric;
  v_transfer_id uuid;
  v_venue_id uuid;
  v_transferred_lots jsonb := '[]'::jsonb;
  v_new_lot_id uuid;
BEGIN
  -- Get venue from source location
  SELECT venue_id INTO v_venue_id
  FROM stock_locations
  WHERE id = p_from_location_id;

  -- Create transfer record
  INSERT INTO stock_transfers (
    from_location_id,
    to_location_id,
    transferred_by,
    jornada_id,
    notes
  ) VALUES (
    p_from_location_id,
    p_to_location_id,
    p_transferred_by,
    p_jornada_id,
    p_notes
  )
  RETURNING id INTO v_transfer_id;

  -- FEFO transfer loop
  FOR v_lot IN 
    SELECT id, quantity, expires_at, received_at, source
    FROM stock_lots
    WHERE product_id = p_product_id
      AND location_id = p_from_location_id
      AND quantity > 0
      AND is_depleted = false
    ORDER BY expires_at ASC, received_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    
    v_deducted := LEAST(v_lot.quantity, v_remaining);
    v_remaining := v_remaining - v_deducted;
    
    -- Reduce source lot
    UPDATE stock_lots
    SET 
      quantity = quantity - v_deducted,
      is_depleted = (quantity - v_deducted <= 0),
      updated_at = now()
    WHERE id = v_lot.id;
    
    -- Create destination lot preserving expiration
    INSERT INTO stock_lots (
      venue_id,
      product_id,
      location_id,
      quantity,
      expires_at,
      received_at,
      source
    ) VALUES (
      v_venue_id,
      p_product_id,
      p_to_location_id,
      v_deducted,
      v_lot.expires_at,
      now(),
      'transfer'
    )
    RETURNING id INTO v_new_lot_id;
    
    -- Create transfer item
    INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
    VALUES (v_transfer_id, p_product_id, v_deducted);
    
    -- Create stock movements
    INSERT INTO stock_movements (product_id, movement_type, quantity, from_location_id, to_location_id, transfer_id, jornada_id, stock_lot_id, notes)
    VALUES (p_product_id, 'salida', v_deducted, p_from_location_id, p_to_location_id, v_transfer_id, p_jornada_id, v_lot.id, 'Transfer out');
    
    INSERT INTO stock_movements (product_id, movement_type, quantity, from_location_id, to_location_id, transfer_id, jornada_id, stock_lot_id, notes)
    VALUES (p_product_id, 'entrada', v_deducted, p_from_location_id, p_to_location_id, v_transfer_id, p_jornada_id, v_new_lot_id, 'Transfer in');
    
    v_transferred_lots := v_transferred_lots || jsonb_build_object(
      'source_lot_id', v_lot.id,
      'dest_lot_id', v_new_lot_id,
      'quantity', v_deducted,
      'expires_at', v_lot.expires_at
    );
  END LOOP;

  -- Update stock_balances
  UPDATE stock_balances
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE product_id = p_product_id AND location_id = p_from_location_id;

  INSERT INTO stock_balances (product_id, location_id, quantity)
  VALUES (p_product_id, p_to_location_id, p_quantity)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = stock_balances.quantity + p_quantity, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'transferred', p_quantity,
    'lots', v_transferred_lots
  );
END;
$$;

-- ============================================
-- UPDATE REDEEM FUNCTION TO USE FEFO
-- ============================================

CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text, p_bartender_bar_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record record;
  v_sale record;
  v_result jsonb;
  v_missing_items jsonb := '[]'::jsonb;
  v_active_jornada_id uuid;
  v_item record;
  v_bar_location_id uuid;
  v_consumption_result jsonb;
  v_venue_is_demo boolean := false;
BEGIN
  -- Find token
  SELECT pt.*, s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
         s.bar_location_id as sale_bar_location_id, s.venue_id
  INTO v_token_record
  FROM pickup_tokens pt
  JOIN sales s ON s.id = pt.sale_id
  WHERE pt.token = p_token;

  IF NOT FOUND THEN
    INSERT INTO pickup_redemptions_log (bartender_id, result, metadata)
    VALUES (auth.uid(), 'not_found', jsonb_build_object('token', p_token));
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Check venue demo status
  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_token_record.venue_id;

  -- Determine bar location
  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id);

  -- Validate token status
  IF v_token_record.status = 'redeemed' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'already_redeemed', 
            jsonb_build_object('redeemed_at', v_token_record.redeemed_at));
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED', 
                              'redeemed_at', v_token_record.redeemed_at);
  END IF;

  IF v_token_record.status = 'expired' OR v_token_record.expires_at < now() THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'expired');
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED');
  END IF;

  IF v_token_record.is_cancelled THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'cancelled');
    RETURN jsonb_build_object('success', false, 'error', 'CANCELLED');
  END IF;

  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'unpaid');
    RETURN jsonb_build_object('success', false, 'error', 'UNPAID');
  END IF;

  -- Get active jornada
  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' LIMIT 1;

  -- Process each sale item with FEFO
  FOR v_item IN
    SELECT 
      ci.product_id,
      p.name as product_name,
      SUM(ci.quantity * si.quantity) as total_quantity
    FROM sale_items si
    JOIN cocktail_ingredients ci ON ci.cocktail_id = si.cocktail_id
    JOIN products p ON p.id = ci.product_id
    WHERE si.sale_id = v_token_record.sale_id
    GROUP BY ci.product_id, p.name
  LOOP
    -- Use FEFO consumption
    v_consumption_result := consume_stock_fefo(
      p_product_id := v_item.product_id,
      p_location_id := v_bar_location_id,
      p_quantity := v_item.total_quantity,
      p_allow_expired := v_venue_is_demo,
      p_jornada_id := v_active_jornada_id,
      p_notes := 'QR redemption: ' || v_token_record.sale_number,
      p_pickup_token_id := v_token_record.id
    );

    IF NOT (v_consumption_result->>'success')::boolean THEN
      v_missing_items := v_missing_items || jsonb_build_object(
        'product_id', v_item.product_id,
        'product_name', v_item.product_name,
        'required', v_item.total_quantity,
        'error', v_consumption_result->>'error'
      );
    END IF;
  END LOOP;

  -- Handle stock errors
  IF jsonb_array_length(v_missing_items) > 0 THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'stock_error',
            jsonb_build_object('missing_items', v_missing_items));
    RETURN jsonb_build_object('success', false, 'error', 'STOCK_ERROR', 'missing_items', v_missing_items);
  END IF;

  -- Mark token as redeemed
  UPDATE pickup_tokens
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid()
  WHERE id = v_token_record.id;

  -- Log success
  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
  VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'success',
          jsonb_build_object('bar_location_id', v_bar_location_id));

  RETURN jsonb_build_object(
    'success', true,
    'sale_number', v_token_record.sale_number,
    'total_amount', v_token_record.total_amount
  );
END;
$$;

-- ============================================
-- MIGRATE EXISTING DATA TO STOCK LOTS
-- ============================================

-- Function to migrate existing stock_balances to stock_lots
CREATE OR REPLACE FUNCTION public.migrate_stock_to_lots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance record;
  v_venue_id uuid;
  v_migrated_count integer := 0;
  v_default_expiry date := CURRENT_DATE + INTERVAL '2 years';
BEGIN
  FOR v_balance IN
    SELECT sb.id, sb.product_id, sb.location_id, sb.quantity
    FROM stock_balances sb
    WHERE sb.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM stock_lots sl 
        WHERE sl.product_id = sb.product_id 
          AND sl.location_id = sb.location_id
          AND sl.source = 'legacy_migration'
      )
  LOOP
    -- Get venue_id from location
    SELECT venue_id INTO v_venue_id
    FROM stock_locations
    WHERE id = v_balance.location_id;

    -- Create stock lot for existing balance
    INSERT INTO stock_lots (
      venue_id,
      product_id,
      location_id,
      quantity,
      expires_at,
      source
    ) VALUES (
      COALESCE(v_venue_id, (SELECT id FROM venues LIMIT 1)),
      v_balance.product_id,
      v_balance.location_id,
      v_balance.quantity,
      v_default_expiry,
      'legacy_migration'
    );

    v_migrated_count := v_migrated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'migrated_balances', v_migrated_count,
    'default_expiry', v_default_expiry
  );
END;
$$;

-- Run migration immediately
SELECT public.migrate_stock_to_lots();

-- ============================================
-- TRIGGER TO SYNC STOCK_LOTS -> STOCK_BALANCES
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_stock_balance_from_lots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  -- Calculate new total from lots
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM stock_lots
  WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
    AND location_id = COALESCE(NEW.location_id, OLD.location_id);

  -- Upsert into stock_balances
  INSERT INTO stock_balances (product_id, location_id, quantity)
  VALUES (
    COALESCE(NEW.product_id, OLD.product_id),
    COALESCE(NEW.location_id, OLD.location_id),
    v_total
  )
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = v_total, updated_at = now();

  RETURN NEW;
END;
$$;

-- Note: Trigger disabled by default to avoid double-updates during initial migration
-- Enable after migration is complete and tested
-- CREATE TRIGGER sync_lots_to_balances
--   AFTER INSERT OR UPDATE OR DELETE ON stock_lots
--   FOR EACH ROW EXECUTE FUNCTION sync_stock_balance_from_lots();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to add new stock lot (for purchases/manual entry)
CREATE OR REPLACE FUNCTION public.add_stock_lot(
  p_venue_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_expires_at date,
  p_source text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot_id uuid;
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
$$;

-- Function to get expiring soon lots
CREATE OR REPLACE FUNCTION public.get_expiring_lots(
  p_venue_id uuid,
  p_days_ahead integer DEFAULT 30
) RETURNS TABLE (
  lot_id uuid,
  product_id uuid,
  product_name text,
  location_id uuid,
  location_name text,
  quantity numeric,
  expires_at date,
  days_until_expiry integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sl.id as lot_id,
    sl.product_id,
    p.name as product_name,
    sl.location_id,
    loc.name as location_name,
    sl.quantity,
    sl.expires_at,
    (sl.expires_at - CURRENT_DATE)::integer as days_until_expiry
  FROM stock_lots sl
  JOIN products p ON p.id = sl.product_id
  JOIN stock_locations loc ON loc.id = sl.location_id
  WHERE sl.venue_id = p_venue_id
    AND sl.quantity > 0
    AND sl.is_depleted = false
    AND sl.expires_at <= CURRENT_DATE + (p_days_ahead || ' days')::interval
  ORDER BY sl.expires_at ASC, sl.quantity DESC;
$$;
