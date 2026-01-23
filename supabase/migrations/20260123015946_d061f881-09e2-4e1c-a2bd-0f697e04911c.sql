-- Fix redeem_pickup_token to avoid double stock deduction
-- The trigger update_stock_on_movement already handles products.current_stock updates when stock_movements are inserted
-- So we remove the direct UPDATE to products.current_stock from the RPC

CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record pickup_tokens%ROWTYPE;
  v_sale_record sales%ROWTYPE;
  v_pos_terminal pos_terminals%ROWTYPE;
  v_bar_location_id UUID;
  v_item record;
  v_ingredient record;
  v_items_summary jsonb := '[]'::jsonb;
  v_current_stock numeric;
  v_required_qty numeric;
  v_normalized_token text;
  v_bartender_id uuid;
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
  
  IF NOT FOUND THEN
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
  
  -- Determine bar location: from POS if available, otherwise use first active bar
  IF v_sale_record.pos_id IS NOT NULL THEN
    SELECT * INTO v_pos_terminal FROM pos_terminals WHERE id = v_sale_record.pos_id;
    v_bar_location_id := v_pos_terminal.location_id;
  ELSE
    -- Fallback: use first active bar location (for legacy sales without pos_id)
    SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'bar' AND is_active = true LIMIT 1;
    
    -- If no bar, use warehouse as fallback (legacy behavior)
    IF v_bar_location_id IS NULL THEN
      SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'warehouse' LIMIT 1;
    END IF;
  END IF;
  
  -- Process each sale item and deduct from bar stock
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
      
      -- Get current bar stock (from stock_balances if exists, otherwise check legacy products.current_stock)
      SELECT quantity INTO v_current_stock
      FROM stock_balances
      WHERE product_id = v_ingredient.product_id AND location_id = v_bar_location_id;
      
      -- If no location-based balance, fall back to legacy products.current_stock
      IF v_current_stock IS NULL THEN
        SELECT current_stock INTO v_current_stock FROM products WHERE id = v_ingredient.product_id;
      END IF;
      
      IF v_current_stock IS NULL OR v_current_stock < v_required_qty THEN
        INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
        VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
          'stock_error'::redemption_result,
          jsonb_build_object('product', v_ingredient.product_name, 'available', COALESCE(v_current_stock, 0), 'required', v_required_qty));
        
        RAISE EXCEPTION 'Stock insuficiente para %: disponible %, requerido %', v_ingredient.product_name, COALESCE(v_current_stock, 0), v_required_qty;
      END IF;
      
      -- Deduct from bar location balance (upsert to handle first deduction)
      INSERT INTO stock_balances (product_id, location_id, quantity)
      VALUES (v_ingredient.product_id, v_bar_location_id, -v_required_qty)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock_balances.quantity - v_required_qty, updated_at = now();
      
      -- Log stock movement with bar location
      -- NOTE: The trigger update_stock_on_movement handles updating products.current_stock
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
  INSERT INTO pickup_redemptions_log (pickup_token_id, sale_id, bartender_id, result, metadata)
  VALUES (v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'success'::redemption_result,
    jsonb_build_object('sale_number', v_sale_record.sale_number, 'items', v_items_summary, 'total_amount', v_sale_record.total_amount, 'bar_location_id', v_bar_location_id));
  
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
    
    RETURN jsonb_build_object('success', false, 'error_code', 'STOCK_ERROR', 'message', SQLERRM);
END;
$function$;

-- Also update the cancel_sale_stock function to match - only restore stock via movements trigger
CREATE OR REPLACE FUNCTION public.cancel_sale_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record pickup_tokens%ROWTYPE;
  item_record RECORD;
  ingredient_record RECORD;
BEGIN
  IF NEW.is_cancelled = TRUE AND OLD.is_cancelled = FALSE THEN
    -- Check if the sale was redeemed (stock was deducted)
    SELECT * INTO v_token_record
    FROM pickup_tokens
    WHERE sale_id = NEW.id AND status = 'redeemed';
    
    -- Only restore stock if the pickup was already redeemed
    IF FOUND THEN
      FOR item_record IN
        SELECT cocktail_id, quantity
        FROM public.sale_items
        WHERE sale_id = NEW.id
      LOOP
        FOR ingredient_record IN
          SELECT product_id, quantity
          FROM public.cocktail_ingredients
          WHERE cocktail_id = item_record.cocktail_id
        LOOP
          -- Restore stock via stock_movements (trigger handles products.current_stock)
          INSERT INTO stock_movements (
            product_id,
            quantity,
            movement_type,
            notes
          ) VALUES (
            ingredient_record.product_id,
            ingredient_record.quantity * item_record.quantity,
            'entrada',
            'Cancelación post-retiro - Venta ' || NEW.sale_number
          );
          
          -- Also restore stock_balances for the bar location
          UPDATE stock_balances
          SET quantity = quantity + (ingredient_record.quantity * item_record.quantity), updated_at = now()
          WHERE product_id = ingredient_record.product_id
            AND location_id = v_token_record.bar_location_id;
        END LOOP;
      END LOOP;
    END IF;
    
    -- Cancel any pending pickup tokens
    UPDATE pickup_tokens
    SET status = 'cancelled'
    WHERE sale_id = NEW.id AND status = 'issued';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add comment documenting the DiStock golden rule
COMMENT ON FUNCTION redeem_pickup_token(text) IS 'DiStock Golden Rule: Inventory ONLY decreases on QR redemption, never on sale creation. This is the ONLY code path that modifies stock.';