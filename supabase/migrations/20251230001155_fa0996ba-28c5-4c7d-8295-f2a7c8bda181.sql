-- Update redeem_pickup_token to be more robust with case-insensitive matching
-- and backward compatibility for prefixed tokens
CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record pickup_tokens%ROWTYPE;
  v_sale_record sales%ROWTYPE;
  v_item record;
  v_ingredient record;
  v_items_summary jsonb := '[]'::jsonb;
  v_current_stock numeric;
  v_required_qty numeric;
  v_normalized_token text;
BEGIN
  -- Normalize input token to lowercase
  v_normalized_token := lower(trim(p_token));
  
  -- Find and lock the token with case-insensitive matching
  -- Also handle backward compatibility for prefixed tokens
  SELECT * INTO v_token_record
  FROM pickup_tokens
  WHERE lower(token) = v_normalized_token
     OR lower(token) = 'pickup:' || v_normalized_token
     OR v_normalized_token = 'pickup:' || lower(token)
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_NOT_FOUND',
      'message', 'Token no encontrado',
      'debug_token', v_normalized_token
    );
  END IF;
  
  -- Idempotency: already redeemed returns info without changing anything
  IF v_token_record.status = 'redeemed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_REDEEMED',
      'message', 'Este código ya fue canjeado',
      'redeemed_at', v_token_record.redeemed_at
    );
  END IF;
  
  IF v_token_record.status = 'expired' OR now() > v_token_record.expires_at THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_EXPIRED',
      'message', 'Este código ha expirado'
    );
  END IF;
  
  IF v_token_record.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_CANCELLED',
      'message', 'Este código fue cancelado'
    );
  END IF;
  
  -- Get sale record
  SELECT * INTO v_sale_record
  FROM sales
  WHERE id = v_token_record.sale_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SALE_NOT_FOUND',
      'message', 'Venta no encontrada'
    );
  END IF;
  
  IF v_sale_record.is_cancelled THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SALE_CANCELLED',
      'message', 'Esta venta fue cancelada'
    );
  END IF;
  
  IF v_sale_record.payment_status != 'paid' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PAYMENT_NOT_CONFIRMED',
      'message', 'El pago no ha sido confirmado'
    );
  END IF;
  
  -- Process each sale item and deduct stock
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_sale_record.id
  LOOP
    -- Add to summary
    v_items_summary := v_items_summary || jsonb_build_object(
      'name', v_item.cocktail_name,
      'quantity', v_item.quantity
    );
    
    -- Deduct each ingredient
    FOR v_ingredient IN
      SELECT ci.product_id, ci.quantity, p.name as product_name, p.current_stock
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      v_required_qty := v_ingredient.quantity * v_item.quantity;
      v_current_stock := v_ingredient.current_stock;
      
      -- Prevent negative stock
      IF v_current_stock < v_required_qty THEN
        RAISE EXCEPTION 'Stock insuficiente para %: disponible %, requerido %', 
          v_ingredient.product_name, v_current_stock, v_required_qty;
      END IF;
      
      -- Deduct stock
      UPDATE products
      SET current_stock = current_stock - v_required_qty,
          updated_at = now()
      WHERE id = v_ingredient.product_id;
      
      -- Log stock movement with reference to pickup token
      INSERT INTO stock_movements (
        product_id,
        quantity,
        movement_type,
        notes
      ) VALUES (
        v_ingredient.product_id,
        v_required_qty,
        'salida',
        'Retiro QR - Venta ' || v_sale_record.sale_number || ' - Token ' || substr(p_token, 1, 8)
      );
    END LOOP;
  END LOOP;
  
  -- Mark token as redeemed (atomic with stock changes)
  UPDATE pickup_tokens
  SET 
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by = auth.uid()
  WHERE id = v_token_record.id;
  
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
    -- Rollback happens automatically, return error
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'STOCK_ERROR',
      'message', SQLERRM
    );
END;
$function$;