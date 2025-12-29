-- 1. Add payment_status to sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid';

-- 2. Create pickup_token_status enum
DO $$ BEGIN
  CREATE TYPE public.pickup_token_status AS ENUM ('issued', 'redeemed', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create pickup_tokens table
CREATE TABLE IF NOT EXISTS public.pickup_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status public.pickup_token_status NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create indexes for pickup_tokens
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_token ON public.pickup_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_sale ON public.pickup_tokens(sale_id);
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_status ON public.pickup_tokens(status, issued_at);

-- 5. Enable RLS on pickup_tokens
ALTER TABLE public.pickup_tokens ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for pickup_tokens
CREATE POLICY "Admins can manage pickup tokens"
ON public.pickup_tokens
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view pickup tokens"
ON public.pickup_tokens
FOR SELECT
USING (public.has_role(auth.uid(), 'gerencia'));

CREATE POLICY "Bar can view issued tokens"
ON public.pickup_tokens
FOR SELECT
USING (public.has_role(auth.uid(), 'bar'));

CREATE POLICY "Sellers can view their sale tokens"
ON public.pickup_tokens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = pickup_tokens.sale_id
    AND sales.seller_id = auth.uid()
  )
);

CREATE POLICY "Sellers can create tokens for their sales"
ON public.pickup_tokens
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = pickup_tokens.sale_id
    AND sales.seller_id = auth.uid()
  )
);

-- 7. Drop existing stock deduction triggers (move to redemption)
DROP TRIGGER IF EXISTS on_sale_item_stock ON public.sale_items;
DROP TRIGGER IF EXISTS trigger_register_stock_movement ON public.sale_items;

-- 8. Create atomic redemption function
CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record pickup_tokens%ROWTYPE;
  v_sale_record sales%ROWTYPE;
  v_item record;
  v_ingredient record;
  v_items_summary jsonb := '[]'::jsonb;
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
  
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_sale_record.id
  LOOP
    v_items_summary := v_items_summary || jsonb_build_object(
      'name', v_item.cocktail_name,
      'quantity', v_item.quantity
    );
    
    FOR v_ingredient IN
      SELECT ci.product_id, ci.quantity
      FROM cocktail_ingredients ci
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      UPDATE products
      SET current_stock = current_stock - (v_ingredient.quantity * v_item.quantity),
          updated_at = now()
      WHERE id = v_ingredient.product_id;
      
      INSERT INTO stock_movements (
        product_id,
        quantity,
        movement_type,
        notes
      ) VALUES (
        v_ingredient.product_id,
        v_ingredient.quantity * v_item.quantity,
        'salida',
        'Retiro QR - Venta ' || v_sale_record.sale_number
      );
    END LOOP;
  END LOOP;
  
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
END;
$$;

-- 9. Function to generate pickup token for a sale
CREATE OR REPLACE FUNCTION public.generate_pickup_token(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_record sales%ROWTYPE;
  v_existing_token pickup_tokens%ROWTYPE;
  v_new_token text;
  v_token_record pickup_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_sale_record
  FROM sales
  WHERE id = p_sale_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SALE_NOT_FOUND',
      'message', 'Venta no encontrada'
    );
  END IF;
  
  SELECT * INTO v_existing_token
  FROM pickup_tokens
  WHERE sale_id = p_sale_id
  AND status = 'issued'
  AND expires_at > now();
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'token', v_existing_token.token,
      'expires_at', v_existing_token.expires_at,
      'sale_number', v_sale_record.sale_number
    );
  END IF;
  
  v_new_token := encode(gen_random_bytes(24), 'base64');
  v_new_token := replace(replace(replace(v_new_token, '/', '_'), '+', '-'), '=', '');
  
  INSERT INTO pickup_tokens (sale_id, token)
  VALUES (p_sale_id, v_new_token)
  RETURNING * INTO v_token_record;
  
  RETURN jsonb_build_object(
    'success', true,
    'token', v_token_record.token,
    'expires_at', v_token_record.expires_at,
    'sale_number', v_sale_record.sale_number
  );
END;
$$;