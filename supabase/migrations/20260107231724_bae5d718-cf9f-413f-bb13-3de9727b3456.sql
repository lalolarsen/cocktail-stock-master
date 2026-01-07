-- Update the newer redeem_pickup_token function to pass source_type
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
BEGIN
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
      RETURN jsonb_build_object('success', false, 'error_code', 'SYSTEM_ERROR', 'message', 'Cover no válido');
    END IF;

    -- Build deliver info
    v_deliver := jsonb_build_object(
      'type', 'cover',
      'name', v_cocktail.name,
      'quantity', COALESCE(v_token_record.cover_quantity, 1),
      'source', 'ticket',
      'ticket_number', v_token_record.ticket_number
    );

    FOR v_ingredient IN
      SELECT ci.product_id, ci.quantity, p.name as product_name, p.unit
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_token_record.cover_cocktail_id
    LOOP
      v_consumption_result := consume_stock_fefo(
        p_product_id := v_ingredient.product_id,
        p_location_id := v_bar_location_id,
        p_quantity := v_ingredient.quantity * v_token_record.cover_quantity,
        p_allow_expired := v_venue_is_demo,
        p_jornada_id := v_active_jornada_id,
        p_notes := 'Cover: ' || v_cocktail.name,
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'pickup'
      );

      IF NOT (v_consumption_result->>'success')::boolean THEN
        v_missing_items := v_missing_items || jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required_qty', v_ingredient.quantity * v_token_record.cover_quantity,
          'unit', v_ingredient.unit
        );
      END IF;
    END LOOP;

    -- STOCK ERROR - token NOT consumed
    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, result, metadata)
      VALUES (auth.uid(), v_token_record.id, 'stock_error', jsonb_build_object('missing_items', v_missing_items));
      RETURN jsonb_build_object(
        'success', false, 
        'error_code', 'INSUFFICIENT_BAR_STOCK', 
        'message', 'Sin stock suficiente',
        'deliver', v_deliver,
        'missing', v_missing_items,
        'bar_name', v_bar_name
      );
    END IF;

    UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid() WHERE id = v_token_record.id;

    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, 'success', jsonb_build_object('type', 'cover', 'cocktail', v_cocktail.name));

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Cover entregado',
      'deliver', v_deliver,
      'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name),
      'redeemed_at', now()
    );
  END IF;

  -- Handle regular sale token
  IF v_token_record.is_cancelled THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'cancelled');
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'unpaid');
    RETURN jsonb_build_object('success', false, 'error_code', 'PAYMENT_NOT_CONFIRMED', 'message', 'Pago no confirmado');
  END IF;

  -- Build items array from sale_items for delivery info
  SELECT jsonb_agg(jsonb_build_object('name', c.name, 'quantity', si.quantity))
  INTO v_items_array
  FROM sale_items si
  JOIN cocktails c ON c.id = si.cocktail_id
  WHERE si.sale_id = v_token_record.sale_id;

  -- Build deliver info for sale
  v_deliver := jsonb_build_object(
    'type', 'menu_items',
    'items', COALESCE(v_items_array, '[]'::jsonb),
    'source', 'sale',
    'sale_number', v_token_record.sale_number
  );

  FOR v_item IN
    SELECT ci.product_id, p.name as product_name, p.unit, SUM(ci.quantity * si.quantity) as total_quantity
    FROM sale_items si
    JOIN cocktail_ingredients ci ON ci.cocktail_id = si.cocktail_id
    JOIN products p ON p.id = ci.product_id
    WHERE si.sale_id = v_token_record.sale_id
    GROUP BY ci.product_id, p.name, p.unit
  LOOP
    v_consumption_result := consume_stock_fefo(
      p_product_id := v_item.product_id,
      p_location_id := v_bar_location_id,
      p_quantity := v_item.total_quantity,
      p_allow_expired := v_venue_is_demo,
      p_jornada_id := v_active_jornada_id,
      p_notes := 'QR: ' || v_token_record.sale_number,
      p_pickup_token_id := v_token_record.id,
      p_source_type := 'pickup'
    );

    IF NOT (v_consumption_result->>'success')::boolean THEN
      v_missing_items := v_missing_items || jsonb_build_object(
        'product_name', v_item.product_name,
        'required_qty', v_item.total_quantity,
        'unit', v_item.unit
      );
    END IF;
  END LOOP;

  -- STOCK ERROR - token NOT consumed
  IF jsonb_array_length(v_missing_items) > 0 THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'stock_error', jsonb_build_object('missing_items', v_missing_items));
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'INSUFFICIENT_BAR_STOCK', 
      'message', 'Sin stock suficiente',
      'deliver', v_deliver,
      'missing', v_missing_items,
      'bar_name', v_bar_name
    );
  END IF;

  UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid() WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
  VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'success', jsonb_build_object('bar_location_id', v_bar_location_id));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pedido entregado',
    'deliver', v_deliver,
    'sale_number', v_token_record.sale_number,
    'total_amount', v_token_record.total_amount,
    'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name),
    'redeemed_at', now()
  );
END;
$$;