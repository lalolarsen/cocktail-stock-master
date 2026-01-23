-- Harden redeem_pickup_token as the ONLY path that decreases inventory
-- DiStock Golden Rule: Stock ONLY decreases on QR redemption, never on sale/ticket creation

CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text, p_bartender_bar_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record record;
  v_sale record;
  v_cocktail record;
  v_ingredient record;
  v_bar_location_id uuid;
  v_bar_name text;
  v_active_jornada_id uuid;
  v_consumption_result jsonb;
  v_missing_items jsonb := '[]'::jsonb;
  v_venue_is_demo boolean := false;
  v_item record;
  v_deliver jsonb;
  v_ticket_number text;
  v_items_array jsonb := '[]'::jsonb;
  v_last_attempt timestamptz;
  v_rate_limit_seconds constant int := 2;
  v_bartender_id uuid;
  v_consumed_ingredients jsonb := '[]'::jsonb;
BEGIN
  v_bartender_id := auth.uid();
  
  -- STEP 1: Rate limit check - prevent duplicate processing within 2 seconds
  SELECT prl.redeemed_at INTO v_last_attempt
  FROM pickup_redemptions_log prl
  JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
  WHERE pt.token = p_token
    AND prl.bartender_id = v_bartender_id
    AND prl.redeemed_at > now() - (v_rate_limit_seconds || ' seconds')::interval
  ORDER BY prl.redeemed_at DESC
  LIMIT 1;

  IF v_last_attempt IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'TOO_FAST', 
      'message', 'Espera un momento antes de escanear de nuevo'
    );
  END IF;

  -- STEP 2: Find and LOCK the token (FOR UPDATE prevents concurrent redemption)
  SELECT pt.*, 
         s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
         s.bar_location_id as sale_bar_location_id, 
         COALESCE(s.venue_id, ts.venue_id) as venue_id,
         ts.ticket_number,
         s.jornada_id as sale_jornada_id
  INTO v_token_record
  FROM pickup_tokens pt
  LEFT JOIN sales s ON s.id = pt.sale_id
  LEFT JOIN ticket_sales ts ON ts.id = pt.ticket_sale_id
  WHERE pt.token = p_token
  FOR UPDATE OF pt;  -- Lock only the token row

  IF NOT FOUND THEN
    INSERT INTO pickup_redemptions_log (bartender_id, result, metadata, pos_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            'not_found', jsonb_build_object('raw_token', p_token), p_bartender_bar_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_NOT_FOUND', 'message', 'Token no encontrado');
  END IF;

  -- Get venue demo status
  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_token_record.venue_id;

  -- STEP 3: Determine bar location (redemption POS)
  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id);
  IF v_bar_location_id IS NULL THEN
    SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'bar' AND is_active = true LIMIT 1;
  END IF;

  SELECT name INTO v_bar_name FROM stock_locations WHERE id = v_bar_location_id;

  -- STEP 4: Validate token status (IDEMPOTENCY CHECK)
  
  -- ALREADY_REDEEMED: Return immediately with NO stock changes, NO new movements
  IF v_token_record.status = 'redeemed' THEN
    -- Build deliver info for UI display
    IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
      SELECT name INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
      v_deliver := jsonb_build_object(
        'type', 'cover',
        'name', COALESCE(v_cocktail.name, 'Cover'),
        'quantity', COALESCE(v_token_record.cover_quantity, 1),
        'source', 'ticket'
      );
    ELSE
      SELECT jsonb_agg(jsonb_build_object('name', c.name, 'quantity', si.quantity))
      INTO v_items_array
      FROM sale_items si
      JOIN cocktails c ON c.id = si.cocktail_id
      WHERE si.sale_id = v_token_record.sale_id;
      
      v_deliver := jsonb_build_object(
        'type', 'menu_items',
        'items', COALESCE(v_items_array, '[]'::jsonb),
        'source', 'sale',
        'sale_number', v_token_record.sale_number
      );
    END IF;
    
    -- Log the duplicate attempt (no stock movement!)
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'already_redeemed', v_bar_location_id,
            jsonb_build_object('original_redeemed_at', v_token_record.redeemed_at, 'bar_name', v_bar_name));
    
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'ALREADY_REDEEMED', 
      'message', 'Este QR ya fue canjeado',
      'deliver', v_deliver,
      'previously_redeemed_at', v_token_record.redeemed_at
    );
  END IF;

  -- EXPIRED
  IF v_token_record.status = 'expired' OR (v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now()) THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'expired', v_bar_location_id,
            jsonb_build_object('expired_at', v_token_record.expires_at, 'bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'Token expirado');
  END IF;

  -- CANCELLED
  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'cancelled', v_bar_location_id,
            jsonb_build_object('bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- STEP 5: Get active jornada for movement tracking
  SELECT id INTO v_active_jornada_id 
  FROM jornadas 
  WHERE estado = 'abierta' 
  ORDER BY created_at DESC 
  LIMIT 1;
  
  -- Fall back to sale's jornada if no open jornada
  IF v_active_jornada_id IS NULL THEN
    v_active_jornada_id := v_token_record.sale_jornada_id;
  END IF;

  -- STEP 6: Process based on token type (cover vs sale items)
  
  -- COVER TOKEN (from ticket sale)
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    
    IF NOT FOUND THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
              v_token_record.id, v_token_record.sale_id, 'not_found', v_bar_location_id,
              jsonb_build_object('error', 'cocktail_not_found', 'cocktail_id', v_token_record.cover_cocktail_id));
      RETURN jsonb_build_object('success', false, 'error_code', 'COCKTAIL_NOT_FOUND', 'message', 'Cocktail no encontrado');
    END IF;

    -- DEDUCT STOCK via consume_stock_fefo (the ONLY stock deduction path)
    FOR v_ingredient IN 
      SELECT ci.*, p.name as product_name, p.unit 
      FROM cocktail_ingredients ci 
      JOIN products p ON p.id = ci.product_id 
      WHERE ci.cocktail_id = v_cocktail.id 
    LOOP
      v_consumption_result := consume_stock_fefo(
        p_product_id := v_ingredient.product_id,
        p_location_id := v_bar_location_id,
        p_quantity := v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
        p_jornada_id := v_active_jornada_id,
        p_notes := 'Cover redemption: ' || v_cocktail.name || ' | Token: ' || substr(p_token, 1, 8),
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'cover_redemption'
      );

      IF (v_consumption_result->>'success')::boolean THEN
        v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
          'product_id', v_ingredient.product_id,
          'product_name', v_ingredient.product_name,
          'quantity', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
          'lots', v_consumption_result->'lots'
        );
      ELSE
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required_qty', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
          'unit', v_ingredient.unit,
          'error', v_consumption_result->>'error'
        ));
      END IF;
    END LOOP;

    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
              v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id,
              jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'consumed', v_consumed_ingredients));
      
      v_deliver := jsonb_build_object(
        'type', 'cover',
        'name', v_cocktail.name,
        'quantity', COALESCE(v_token_record.cover_quantity, 1),
        'source', 'ticket'
      );
      
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INSUFFICIENT_BAR_STOCK',
        'message', 'Stock insuficiente en esta barra',
        'bar_name', v_bar_name,
        'deliver', v_deliver,
        'missing', v_missing_items
      );
    END IF;

    -- MARK AS REDEEMED (atomic update)
    UPDATE pickup_tokens 
    SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id, bar_location_id = v_bar_location_id 
    WHERE id = v_token_record.id;

    -- LOG SUCCESS with full audit trail
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id,
            jsonb_build_object('bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients));

    v_deliver := jsonb_build_object(
      'type', 'cover',
      'name', v_cocktail.name,
      'quantity', COALESCE(v_token_record.cover_quantity, 1),
      'source', 'ticket',
      'ticket_number', v_token_record.ticket_number
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Canje exitoso',
      'deliver', v_deliver,
      'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name),
      'redeemed_at', now()
    );
  END IF;

  -- REGULAR SALE TOKEN
  -- Additional validations for sale tokens
  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'payment_pending', v_bar_location_id,
            jsonb_build_object('payment_status', v_token_record.payment_status, 'bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'PAYMENT_NOT_CONFIRMED', 'message', 'Pago no confirmado');
  END IF;

  IF v_token_record.is_cancelled THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'cancelled', v_bar_location_id,
            jsonb_build_object('bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- DEDUCT STOCK for each sale item via consume_stock_fefo
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name, c.id as cocktail_id
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_token_record.sale_id
  LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);

    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      v_consumption_result := consume_stock_fefo(
        p_product_id := v_ingredient.product_id,
        p_location_id := v_bar_location_id,
        p_quantity := v_ingredient.quantity * v_item.quantity,
        p_jornada_id := v_active_jornada_id,
        p_notes := 'Sale redemption: ' || v_item.cocktail_name || ' | Venta ' || v_token_record.sale_number || ' | Token: ' || substr(p_token, 1, 8),
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'sale_redemption'
      );

      IF (v_consumption_result->>'success')::boolean THEN
        v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
          'product_id', v_ingredient.product_id,
          'product_name', v_ingredient.product_name,
          'quantity', v_ingredient.quantity * v_item.quantity,
          'lots', v_consumption_result->'lots'
        );
      ELSE
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required_qty', v_ingredient.quantity * v_item.quantity,
          'unit', v_ingredient.unit,
          'error', v_consumption_result->>'error'
        ));
      END IF;
    END LOOP;
  END LOOP;

  IF jsonb_array_length(v_missing_items) > 0 THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id,
            jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'consumed', v_consumed_ingredients));

    v_deliver := jsonb_build_object(
      'type', 'menu_items',
      'items', v_items_array,
      'source', 'sale',
      'sale_number', v_token_record.sale_number
    );

    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INSUFFICIENT_BAR_STOCK',
      'message', 'Stock insuficiente en esta barra',
      'bar_name', v_bar_name,
      'deliver', v_deliver,
      'missing', v_missing_items
    );
  END IF;

  -- MARK AS REDEEMED (atomic update)
  UPDATE pickup_tokens
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id, bar_location_id = v_bar_location_id
  WHERE id = v_token_record.id;

  -- LOG SUCCESS with full audit trail
  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
  VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
          v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id,
          jsonb_build_object('sale_number', v_token_record.sale_number, 'items', v_items_array, 
                             'total_amount', v_token_record.total_amount, 'bar_name', v_bar_name,
                             'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients));

  v_deliver := jsonb_build_object(
    'type', 'menu_items',
    'items', v_items_array,
    'source', 'sale',
    'sale_number', v_token_record.sale_number
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Canje exitoso',
    'deliver', v_deliver,
    'sale_number', v_token_record.sale_number,
    'total_amount', v_token_record.total_amount,
    'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name),
    'redeemed_at', now()
  );
END;
$$;

-- Add explicit documentation of the DiStock Golden Rule
COMMENT ON FUNCTION redeem_pickup_token(text, uuid) IS 
'DiStock Golden Rule: Inventory ONLY decreases on QR redemption via consume_stock_fefo, NEVER on sale/ticket creation.
This is the SINGLE source of truth for inventory decrements.
Features:
- FOR UPDATE row locking prevents concurrent redemption
- Idempotent: already_redeemed returns immediately with NO stock movement
- Rate-limited: 2-second window prevents duplicate processing
- Full audit trail in pickup_redemptions_log with pos_id, metadata, and ingredient breakdown
- Stock movements tracked via consume_stock_fefo with pickup_token_id linkage';

-- Ensure pickup_redemptions_log has proper indexes for rate limiting and auditing
CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_log_token_bartender_time 
ON pickup_redemptions_log (pickup_token_id, bartender_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_log_pos_time 
ON pickup_redemptions_log (pos_id, redeemed_at DESC);