-- Drop triggers that deduct stock on sale creation
DROP TRIGGER IF EXISTS process_sale_stock_trigger ON sale_items;
DROP TRIGGER IF EXISTS register_stock_movement_on_sale_trigger ON sale_items;
DROP TRIGGER IF EXISTS on_sale_item_created ON sale_items;

-- Drop the trigger functions (no longer needed)
DROP FUNCTION IF EXISTS process_sale_stock() CASCADE;
DROP FUNCTION IF EXISTS register_stock_movement_on_sale() CASCADE;

-- Update redeem_pickup_token to ensure robust stock deduction with negative stock protection
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
BEGIN
  -- Find and lock the token
  SELECT * INTO v_token_record
  FROM pickup_tokens
  WHERE token = p_token
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_NOT_FOUND',
      'message', 'Token no encontrado'
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

-- Also update cancel_sale_stock to NOT restore stock (since it was never deducted)
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
          -- Restore stock
          UPDATE public.products
          SET current_stock = current_stock + (ingredient_record.quantity * item_record.quantity),
              updated_at = NOW()
          WHERE id = ingredient_record.product_id;
          
          -- Log restoration
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