-- =============================================================================
-- MULTI-BAR INVENTORY SYSTEM
-- =============================================================================

-- 1. Create location_type enum
CREATE TYPE public.location_type AS ENUM ('warehouse', 'bar');

-- 2. Create stock_locations table
CREATE TABLE public.stock_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type public.location_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on stock_locations
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

-- RLS policies for stock_locations
CREATE POLICY "Admins can manage stock locations"
ON public.stock_locations FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view stock locations"
ON public.stock_locations FOR SELECT
USING (true);

-- 3. Create pos_terminals table
CREATE TABLE public.pos_terminals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on pos_terminals
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

-- RLS policies for pos_terminals
CREATE POLICY "Admins can manage POS terminals"
ON public.pos_terminals FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view POS terminals"
ON public.pos_terminals FOR SELECT
USING (true);

-- 4. Create stock_balances table (per-location stock)
CREATE TABLE public.stock_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, location_id)
);

-- Enable RLS on stock_balances
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;

-- RLS policies for stock_balances
CREATE POLICY "Admins can manage stock balances"
ON public.stock_balances FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view stock balances"
ON public.stock_balances FOR SELECT
USING (true);

CREATE POLICY "Gerencia can view stock balances"
ON public.stock_balances FOR SELECT
USING (has_role(auth.uid(), 'gerencia'));

-- 5. Create stock_transfers table for logging transfers
CREATE TABLE public.stock_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  to_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  transferred_by UUID NOT NULL,
  jornada_id UUID REFERENCES public.jornadas(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on stock_transfers
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for stock_transfers
CREATE POLICY "Admins can manage stock transfers"
ON public.stock_transfers FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view stock transfers"
ON public.stock_transfers FOR SELECT
USING (true);

-- 6. Create stock_transfer_items table
CREATE TABLE public.stock_transfer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on stock_transfer_items
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for stock_transfer_items
CREATE POLICY "Admins can manage stock transfer items"
ON public.stock_transfer_items FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view stock transfer items"
ON public.stock_transfer_items FOR SELECT
USING (true);

-- 7. Add pos_id to sales table (keeping point_of_sale for backward compatibility)
ALTER TABLE public.sales ADD COLUMN pos_id UUID REFERENCES public.pos_terminals(id);

-- 8. Add location references to stock_movements
ALTER TABLE public.stock_movements 
ADD COLUMN from_location_id UUID REFERENCES public.stock_locations(id),
ADD COLUMN to_location_id UUID REFERENCES public.stock_locations(id),
ADD COLUMN transfer_id UUID REFERENCES public.stock_transfers(id);

-- 9. Create default warehouse location
INSERT INTO public.stock_locations (name, type) VALUES ('Bodega', 'warehouse');

-- 10. Create trigger to update updated_at
CREATE TRIGGER update_stock_locations_updated_at
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pos_terminals_updated_at
  BEFORE UPDATE ON public.pos_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_balances_updated_at
  BEFORE UPDATE ON public.stock_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Create constraint to ensure POS only links to bar locations (via trigger)
CREATE OR REPLACE FUNCTION public.check_pos_location_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_locations 
    WHERE id = NEW.location_id AND type = 'bar'
  ) THEN
    RAISE EXCEPTION 'POS terminal must be linked to a bar location';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_pos_bar_location
  BEFORE INSERT OR UPDATE ON public.pos_terminals
  FOR EACH ROW EXECUTE FUNCTION public.check_pos_location_type();

-- 12. Create transfer_stock RPC function
CREATE OR REPLACE FUNCTION public.transfer_stock(
  p_from_location_id UUID,
  p_to_location_id UUID,
  p_items JSONB,
  p_jornada_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_location stock_locations%ROWTYPE;
  v_to_location stock_locations%ROWTYPE;
  v_transfer_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_current_balance NUMERIC;
  v_transferred_items JSONB := '[]'::JSONB;
  v_user_id UUID;
  v_jornada_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Check admin permission
  IF NOT has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized - admin only');
  END IF;
  
  -- Validate from_location is warehouse
  SELECT * INTO v_from_location FROM stock_locations WHERE id = p_from_location_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'From location not found');
  END IF;
  IF v_from_location.type != 'warehouse' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfers must originate from warehouse');
  END IF;
  
  -- Validate to_location is bar
  SELECT * INTO v_to_location FROM stock_locations WHERE id = p_to_location_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'To location not found');
  END IF;
  IF v_to_location.type != 'bar' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfers must go to a bar location');
  END IF;
  
  -- Get active jornada if not provided
  IF p_jornada_id IS NULL THEN
    v_jornada_id := get_active_jornada();
  ELSE
    v_jornada_id := p_jornada_id;
  END IF;
  
  -- Create transfer record
  INSERT INTO stock_transfers (from_location_id, to_location_id, transferred_by, jornada_id, notes)
  VALUES (p_from_location_id, p_to_location_id, v_user_id, v_jornada_id, p_notes)
  RETURNING id INTO v_transfer_id;
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    
    IF v_quantity <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Get current warehouse balance
    SELECT quantity INTO v_current_balance
    FROM stock_balances
    WHERE product_id = v_product_id AND location_id = p_from_location_id;
    
    IF v_current_balance IS NULL OR v_current_balance < v_quantity THEN
      -- Rollback will happen automatically
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Insufficient stock in warehouse for product %s: available=%s, requested=%s', 
          v_product_id, COALESCE(v_current_balance, 0), v_quantity)
      );
    END IF;
    
    -- Deduct from warehouse
    UPDATE stock_balances
    SET quantity = quantity - v_quantity, updated_at = now()
    WHERE product_id = v_product_id AND location_id = p_from_location_id;
    
    -- Add to bar (upsert)
    INSERT INTO stock_balances (product_id, location_id, quantity)
    VALUES (v_product_id, p_to_location_id, v_quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = stock_balances.quantity + v_quantity, updated_at = now();
    
    -- Create transfer item record
    INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
    VALUES (v_transfer_id, v_product_id, v_quantity);
    
    -- Log stock movements
    INSERT INTO stock_movements (product_id, movement_type, quantity, from_location_id, to_location_id, transfer_id, jornada_id, notes)
    VALUES (v_product_id, 'salida', v_quantity, p_from_location_id, p_to_location_id, v_transfer_id, v_jornada_id, 'Transfer to bar');
    
    v_transferred_items := v_transferred_items || jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity);
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'items', v_transferred_items,
    'from_location', v_from_location.name,
    'to_location', v_to_location.name
  );
END;
$$;

-- 13. Update redeem_pickup_token to use location-based stock
CREATE OR REPLACE FUNCTION public.redeem_pickup_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 14. Helper function to initialize stock balances from existing products
CREATE OR REPLACE FUNCTION public.initialize_warehouse_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id UUID;
  v_product RECORD;
BEGIN
  -- Get warehouse location ID
  SELECT id INTO v_warehouse_id FROM stock_locations WHERE type = 'warehouse' LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse location not found';
  END IF;
  
  -- Initialize stock_balances from existing products.current_stock
  FOR v_product IN SELECT id, current_stock FROM products
  LOOP
    INSERT INTO stock_balances (product_id, location_id, quantity)
    VALUES (v_product.id, v_warehouse_id, v_product.current_stock)
    ON CONFLICT (product_id, location_id) DO NOTHING;
  END LOOP;
END;
$$;

-- 15. Run initialization
SELECT public.initialize_warehouse_stock();