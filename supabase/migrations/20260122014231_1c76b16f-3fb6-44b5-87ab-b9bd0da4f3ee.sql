-- Add server-side rate limiting to redeem_pickup_token
-- Prevents same token from being processed twice within 2 seconds

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
BEGIN
  -- RATE LIMIT CHECK: Prevent same token from being hit twice within 2 seconds
  -- Check pickup_redemptions_log for recent attempts on this token
  SELECT prl.redeemed_at INTO v_last_attempt
  FROM pickup_redemptions_log prl
  JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
  WHERE pt.token = p_token
    AND prl.bartender_id = auth.uid()
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

  -- Find token (handle both sale and ticket tokens)
  SELECT pt.*, 
         s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
         s.bar_location_id as sale_bar_location_id, 
         COALESCE(s.venue_id, ts.venue_id) as venue_id,
         ts.ticket_number
  INTO v_token_record
  FROM pickup_tokens pt
  LEFT JOIN sales s ON s.id = pt.sale_id
  LEFT JOIN ticket_sales ts ON ts.id = pt.ticket_sale_id
  WHERE pt.token = p_token;

  IF NOT FOUND THEN
    INSERT INTO pickup_redemptions_log (bartender_id, result, metadata)
    VALUES (auth.uid(), 'not_found', jsonb_build_object('token', p_token));
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_NOT_FOUND', 'message', 'Token no encontrado');
  END IF;

  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_token_record.venue_id;

  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id);
  IF v_bar_location_id IS NULL THEN
    SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'bar' AND is_active = true LIMIT 1;
  END IF;

  -- Get bar name
  SELECT name INTO v_bar_name FROM stock_locations WHERE id = v_bar_location_id;

  -- Handle ALREADY REDEEMED - return delivery info
  IF v_token_record.status = 'redeemed' THEN
    -- Build deliver info for already redeemed
    IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
      SELECT name INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
      v_deliver := jsonb_build_object(
        'type', 'cover',
        'name', COALESCE(v_cocktail.name, 'Cover'),
        'quantity', COALESCE(v_token_record.cover_quantity, 1),
        'source', 'ticket'
      );
    ELSE
      -- Build items from sale_items
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
    
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'already_redeemed', 
            jsonb_build_object('redeemed_at', v_token_record.redeemed_at));
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'ALREADY_REDEEMED', 
      'message', 'Este QR ya fue canjeado',
      'deliver', v_deliver,
      'previously_redeemed_at', v_token_record.redeemed_at
    );
  END IF;

  IF v_token_record.status = 'expired' OR v_token_record.expires_at < now() THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'expired');
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'Token expirado');
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'cancelled');
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' LIMIT 1;

  -- Handle cover token (from ticket sale)
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'COCKTAIL_NOT_FOUND', 'message', 'Cocktail no encontrado');
    END IF;

    -- Process each ingredient
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
        p_notes := 'Cover redemption: ' || v_cocktail.name,
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'cover_redemption'
      );

      IF NOT (v_consumption_result->>'success')::boolean THEN
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required_qty', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
          'unit', v_ingredient.unit
        ));
      END IF;
    END LOOP;

    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
      VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id,
              jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name));
      
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

    -- Mark as redeemed
    UPDATE pickup_tokens 
    SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid(), bar_location_id = v_bar_location_id 
    WHERE id = v_token_record.id;

    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id);

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
      'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name)
    );
  END IF;

  -- Handle regular sale token
  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'payment_pending');
    RETURN jsonb_build_object('success', false, 'error_code', 'PAYMENT_NOT_CONFIRMED', 'message', 'Pago no confirmado');
  END IF;

  IF v_token_record.is_cancelled THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'cancelled');
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- Process sale items
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name, c.id as cocktail_id
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_token_record.sale_id
  LOOP
    v_items_array := v_items_array || jsonb_build_array(jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity));

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
        p_notes := 'Sale redemption: ' || v_item.cocktail_name,
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'sale_redemption'
      );

      IF NOT (v_consumption_result->>'success')::boolean THEN
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required_qty', v_ingredient.quantity * v_item.quantity,
          'unit', v_ingredient.unit
        ));
      END IF;
    END LOOP;
  END LOOP;

  IF jsonb_array_length(v_missing_items) > 0 THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id,
            jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name));

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

  -- Mark as redeemed
  UPDATE pickup_tokens
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid(), bar_location_id = v_bar_location_id
  WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id)
  VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id);

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
    'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name)
  );
END;
$$;