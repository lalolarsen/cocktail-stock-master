-- Create enum for redemption results
CREATE TYPE public.redemption_result AS ENUM (
  'success',
  'already_redeemed', 
  'expired',
  'invalid',
  'unpaid',
  'cancelled',
  'not_found',
  'stock_error',
  'timeout'
);

-- Create append-only audit log table for pickup redemptions
CREATE TABLE public.pickup_redemptions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_token_id uuid REFERENCES public.pickup_tokens(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  bartender_id uuid NOT NULL,
  pos_id text,
  result public.redemption_result NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_pickup_redemptions_log_redeemed_at ON public.pickup_redemptions_log(redeemed_at DESC);
CREATE INDEX idx_pickup_redemptions_log_bartender_id ON public.pickup_redemptions_log(bartender_id);
CREATE INDEX idx_pickup_redemptions_log_result ON public.pickup_redemptions_log(result);
CREATE INDEX idx_pickup_redemptions_log_sale_id ON public.pickup_redemptions_log(sale_id);

-- Enable RLS
ALTER TABLE public.pickup_redemptions_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admin and gerencia can SELECT, no UPDATE or DELETE allowed
CREATE POLICY "Admins can view redemption logs"
ON public.pickup_redemptions_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view redemption logs"
ON public.pickup_redemptions_log
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- No INSERT policy for regular users - only RPC functions can insert (SECURITY DEFINER)
-- No UPDATE or DELETE policies - table is append-only

-- Add comment for documentation
COMMENT ON TABLE public.pickup_redemptions_log IS 'Append-only audit log for all QR pickup redemption attempts. No UPDATE or DELETE allowed.';

-- Update stock_movements to optionally reference pickup_token_id for traceability
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS pickup_token_id uuid REFERENCES public.pickup_tokens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_pickup_token_id ON public.stock_movements(pickup_token_id);

-- Now update the redeem_pickup_token function to log all attempts
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
  v_result_code redemption_result;
  v_error_message text;
  v_bartender_id uuid;
BEGIN
  -- Get current user
  v_bartender_id := auth.uid();
  
  -- Normalize input token to lowercase
  v_normalized_token := lower(trim(p_token));
  
  -- Find and lock the token with case-insensitive matching
  SELECT * INTO v_token_record
  FROM pickup_tokens
  WHERE lower(token) = v_normalized_token
     OR lower(token) = 'pickup:' || v_normalized_token
     OR v_normalized_token = 'pickup:' || lower(token)
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Log failed attempt - token not found
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      NULL, NULL, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 
      'not_found'::redemption_result,
      jsonb_build_object('raw_input', p_token, 'normalized', v_normalized_token)
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_NOT_FOUND',
      'message', 'Token no encontrado',
      'debug_token', v_normalized_token
    );
  END IF;
  
  -- Get sale record for logging
  SELECT * INTO v_sale_record
  FROM sales
  WHERE id = v_token_record.sale_id;
  
  -- Idempotency: already redeemed
  IF v_token_record.status = 'redeemed' THEN
    -- Log failed attempt
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      v_token_record.id, v_token_record.sale_id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'already_redeemed'::redemption_result,
      jsonb_build_object('original_redeemed_at', v_token_record.redeemed_at)
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_REDEEMED',
      'message', 'Este código ya fue canjeado',
      'redeemed_at', v_token_record.redeemed_at
    );
  END IF;
  
  -- Expired token
  IF v_token_record.status = 'expired' OR now() > v_token_record.expires_at THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    
    -- Log failed attempt
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      v_token_record.id, v_token_record.sale_id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'expired'::redemption_result,
      jsonb_build_object('expired_at', v_token_record.expires_at)
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_EXPIRED',
      'message', 'Este código ha expirado'
    );
  END IF;
  
  -- Cancelled token
  IF v_token_record.status = 'cancelled' THEN
    -- Log failed attempt
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      v_token_record.id, v_token_record.sale_id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'cancelled'::redemption_result,
      NULL
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_CANCELLED',
      'message', 'Este código fue cancelado'
    );
  END IF;
  
  IF NOT FOUND THEN
    -- Log failed attempt - sale not found
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      v_token_record.id, NULL, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'not_found'::redemption_result,
      jsonb_build_object('error', 'sale_not_found')
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SALE_NOT_FOUND',
      'message', 'Venta no encontrada'
    );
  END IF;
  
  -- Sale cancelled
  IF v_sale_record.is_cancelled THEN
    -- Log failed attempt
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'cancelled'::redemption_result,
      jsonb_build_object('sale_cancelled', true)
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SALE_CANCELLED',
      'message', 'Esta venta fue cancelada'
    );
  END IF;
  
  -- Payment not confirmed
  IF v_sale_record.payment_status != 'paid' THEN
    -- Log failed attempt
    INSERT INTO pickup_redemptions_log (
      pickup_token_id, sale_id, bartender_id, result, metadata
    ) VALUES (
      v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'unpaid'::redemption_result,
      jsonb_build_object('payment_status', v_sale_record.payment_status)
    );
    
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
        -- Log stock error
        INSERT INTO pickup_redemptions_log (
          pickup_token_id, sale_id, bartender_id, result, metadata
        ) VALUES (
          v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
          'stock_error'::redemption_result,
          jsonb_build_object(
            'product', v_ingredient.product_name,
            'available', v_current_stock,
            'required', v_required_qty
          )
        );
        
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
        notes,
        pickup_token_id
      ) VALUES (
        v_ingredient.product_id,
        v_required_qty,
        'salida',
        'Retiro QR - Venta ' || v_sale_record.sale_number || ' - Token ' || substr(p_token, 1, 8),
        v_token_record.id
      );
    END LOOP;
  END LOOP;
  
  -- Mark token as redeemed (atomic with stock changes)
  UPDATE pickup_tokens
  SET 
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by = v_bartender_id
  WHERE id = v_token_record.id;
  
  -- Log successful redemption
  INSERT INTO pickup_redemptions_log (
    pickup_token_id, sale_id, bartender_id, result, metadata
  ) VALUES (
    v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'success'::redemption_result,
    jsonb_build_object(
      'sale_number', v_sale_record.sale_number,
      'items', v_items_summary,
      'total_amount', v_sale_record.total_amount
    )
  );
  
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
    -- Log error (if not already logged for stock error)
    BEGIN
      INSERT INTO pickup_redemptions_log (
        pickup_token_id, sale_id, bartender_id, result, metadata
      ) VALUES (
        v_token_record.id, v_sale_record.id, COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'stock_error'::redemption_result,
        jsonb_build_object('error', SQLERRM)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ignore logging errors
    END;
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'STOCK_ERROR',
      'message', SQLERRM
    );
END;
$function$;