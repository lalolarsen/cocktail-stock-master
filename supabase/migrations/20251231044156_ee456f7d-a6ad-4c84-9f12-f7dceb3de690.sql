-- Update redeem_pickup_token to check stock BEFORE redeeming and return missing ingredient details
CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text, p_bartender_bar_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token_record pickup_tokens%ROWTYPE;
  v_sale_record sales%ROWTYPE;
  v_pos_terminal pos_terminals%ROWTYPE;
  v_bar_location_id UUID;
  v_item record;
  v_ingredient record;
  v_items_summary jsonb := '[]'::jsonb;
  v_missing_items jsonb := '[]'::jsonb;
  v_current_stock numeric;
  v_required_qty numeric;
  v_normalized_token text;
  v_bartender_id uuid;
  v_token_bar_name text;
  v_bartender_bar_name text;
  v_has_insufficient_stock boolean := false;
  v_product_unit text;
BEGIN
  v_bartender_id := auth.uid();
  v_normalized_token := lower(trim(p_token));
  
  -- Find and lock the token
  SELECT * INTO v_token_record
  FROM pickup_tokens
  WHERE lower(token) = v_normalized_token
     OR lower(token) = 'pickup:' || v_normalized_token
     OR v_normalized_token = 'pickup:' || lower(token)
  FOR UPDATE;
  
  IF NOT FOUND THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (NULL, NULL, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
      'not_found'::redemption_result,
      jsonb_build_object('raw_input', p_token, 'normalized', v_normalized_token));
    
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_NOT_FOUND', 'message', 'Token no encontrado');
  END IF;
  
  -- Get sale record
  SELECT * INTO v_sale_record FROM sales WHERE id = v_token_record.sale_id;
  
  -- Check token status
  IF v_token_record.status = 'redeemed' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (v_token_record.id, v_token_record.sale_id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'already_redeemed'::redemption_result, jsonb_build_object('original_redeemed_at', v_token_record.redeemed_at));
    
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_REDEEMED', 'message', 'Este código ya fue canjeado', 'redeemed_at', v_token_record.redeemed_at);
  END IF;
  
  IF v_token_record.status = 'expired' OR now() > v_token_record.expires_at THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (v_token_record.id, v_token_record.sale_id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'expired'::redemption_result, jsonb_build_object('expired_at', v_token_record.expires_at));
    
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'Este código ha expirado');
  END IF;
  
  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (v_token_record.id, v_token_record.sale_id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'cancelled'::redemption_result, NULL);
    
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_CANCELLED', 'message', 'Este código fue cancelado');
  END IF;
  
  IF v_sale_record.id IS NULL THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (v_token_record.id, NULL, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'not_found'::redemption_result, jsonb_build_object('error', 'sale_not_found'));
    
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_NOT_FOUND', 'message', 'Venta no encontrada');
  END IF;
  
  IF v_sale_record.is_cancelled THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'cancelled'::redemption_result, jsonb_build_object('sale_cancelled', true));
    
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Esta venta fue cancelada');
  END IF;
  
  IF v_sale_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
    VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'unpaid'::redemption_result, jsonb_build_object('payment_status', v_sale_record.payment_status));
    
    RETURN jsonb_build_object('success', false, 'error_code', 'PAYMENT_NOT_CONFIRMED', 'message', 'El pago no ha sido confirmado');
  END IF;
  
  -- Determine bar location: use bartender's bar if provided, otherwise fallback chain
  IF p_bartender_bar_id IS NOT NULL THEN
    v_bar_location_id := p_bartender_bar_id;
  ELSIF v_token_record.bar_location_id IS NOT NULL THEN
    v_bar_location_id := v_token_record.bar_location_id;
  ELSIF v_sale_record.bar_location_id IS NOT NULL THEN
    v_bar_location_id := v_sale_record.bar_location_id;
  ELSIF v_sale_record.pos_id IS NOT NULL THEN
    SELECT * INTO v_pos_terminal FROM pos_terminals WHERE id = v_sale_record.pos_id;
    v_bar_location_id := v_pos_terminal.location_id;
  ELSE
    -- Fallback: use first active bar location (for legacy sales)
    SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'bar' AND is_active = true LIMIT 1;
    
    -- If no bar, use warehouse as fallback (legacy behavior)
    IF v_bar_location_id IS NULL THEN
      SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'warehouse' LIMIT 1;
    END IF;
  END IF;
  
  -- Get bar name for messages
  SELECT name INTO v_bartender_bar_name FROM stock_locations WHERE id = v_bar_location_id;
  
  -- ============================================================
  -- PHASE 1: CHECK STOCK AVAILABILITY (before any modifications)
  -- ============================================================
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_sale_record.id
  LOOP
    -- Check each ingredient
    FOR v_ingredient IN
      SELECT ci.product_id, ci.quantity, p.name as product_name, p.unit
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      v_required_qty := v_ingredient.quantity * v_item.quantity;
      
      -- Get current bar stock
      SELECT quantity INTO v_current_stock
      FROM stock_balances
      WHERE product_id = v_ingredient.product_id AND location_id = v_bar_location_id;
      
      -- If no location-based balance, fall back to 0 (not legacy products.current_stock for bar-specific check)
      IF v_current_stock IS NULL THEN
        v_current_stock := 0;
      END IF;
      
      -- Determine unit display
      v_product_unit := COALESCE(v_ingredient.unit, 'unidades');
      
      IF v_current_stock < v_required_qty THEN
        v_has_insufficient_stock := true;
        v_missing_items := v_missing_items || jsonb_build_object(
          'product_id', v_ingredient.product_id,
          'name', v_ingredient.product_name,
          'required', v_required_qty,
          'available', v_current_stock,
          'unit', v_product_unit
        );
      END IF;
    END LOOP;
  END LOOP;
  
  -- ============================================================
  -- PHASE 2: IF INSUFFICIENT STOCK, RETURN ERROR (no redemption)
  -- ============================================================
  IF v_has_insufficient_stock THEN
    -- Log the failed attempt (token stays 'issued')
    INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata, pos_id)
    VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'stock_error'::redemption_result,
      jsonb_build_object(
        'error', 'insufficient_bar_stock',
        'bar_location_id', v_bar_location_id,
        'bar_name', v_bartender_bar_name,
        'missing_items', v_missing_items
      ),
      p_bartender_bar_id::text);
    
    -- Return error with missing items details - TOKEN REMAINS REDEEMABLE
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INSUFFICIENT_BAR_STOCK',
      'message', 'Stock insuficiente en esta barra',
      'bar_name', v_bartender_bar_name,
      'missing', v_missing_items
    );
  END IF;
  
  -- ============================================================
  -- PHASE 3: STOCK IS SUFFICIENT - PROCEED WITH REDEMPTION
  -- ============================================================
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_sale_record.id
  LOOP
    v_items_summary := v_items_summary || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    
    -- Deduct each ingredient from bar location
    FOR v_ingredient IN
      SELECT ci.product_id, ci.quantity, p.name as product_name
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      v_required_qty := v_ingredient.quantity * v_item.quantity;
      
      -- Deduct from bar location balance
      INSERT INTO stock_balances (product_id, location_id, quantity)
      VALUES (v_ingredient.product_id, v_bar_location_id, -v_required_qty)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock_balances.quantity - v_required_qty, updated_at = now();
      
      -- Also update legacy products.current_stock for backward compatibility
      UPDATE products
      SET current_stock = current_stock - v_required_qty, updated_at = now()
      WHERE id = v_ingredient.product_id;
      
      -- Log stock movement with bar location
      INSERT INTO stock_movements (product_id, quantity, movement_type, notes, pickup_token_id, from_location_id, jornada_id)
      VALUES (v_ingredient.product_id, v_required_qty, 'salida',
        'Retiro QR - Venta ' || v_sale_record.sale_number || ' - Token ' || substr(p_token, 1, 8),
        v_token_record.id, v_bar_location_id, v_sale_record.jornada_id);
    END LOOP;
  END LOOP;
  
  -- Mark token as redeemed
  UPDATE pickup_tokens
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id
  WHERE id = v_token_record.id;
  
  -- Log successful redemption
  INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata, pos_id)
  VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'success'::redemption_result,
    jsonb_build_object('sale_number', v_sale_record.sale_number, 'items', v_items_summary, 'total_amount', v_sale_record.total_amount, 'bar_location_id', v_bar_location_id),
    p_bartender_bar_id::text);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Entregado correctamente',
    'sale_number', v_sale_record.sale_number,
    'items', v_items_summary,
    'total_amount', v_sale_record.total_amount,
    'redeemed_at', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
      VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'stock_error'::redemption_result, jsonb_build_object('error', SQLERRM));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    
    RETURN jsonb_build_object('success', false, 'error_code', 'SYSTEM_ERROR', 'message', SQLERRM);
END;
$$;