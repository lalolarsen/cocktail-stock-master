-- Standardize pickup_tokens for unified QR issuance
-- Add venue_id and jornada_id for better traceability

-- Add venue_id column if not exists
ALTER TABLE public.pickup_tokens 
ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id);

-- Add jornada_id column if not exists  
ALTER TABLE public.pickup_tokens 
ADD COLUMN IF NOT EXISTS jornada_id uuid REFERENCES public.jornadas(id);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_venue_id ON public.pickup_tokens(venue_id);
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_jornada_id ON public.pickup_tokens(jornada_id);

-- Update generate_pickup_token to include venue_id, jornada_id, and delivery payload in metadata
CREATE OR REPLACE FUNCTION public.generate_pickup_token(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_sale_record record;
  v_items_array jsonb;
BEGIN
  -- Get sale info with venue and jornada
  SELECT s.id, s.venue_id, s.jornada_id, s.sale_number
  INTO v_sale_record
  FROM sales s
  WHERE s.id = p_sale_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sale not found');
  END IF;
  
  -- Check if token already exists for this sale (idempotent)
  SELECT id, token, expires_at INTO v_token_id, v_token, v_expires_at
  FROM pickup_tokens
  WHERE sale_id = p_sale_id AND source_type = 'sale';
  
  IF v_token_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'token', v_token,
      'expires_at', v_expires_at,
      'bar_name', null
    );
  END IF;
  
  -- Build delivery payload from sale_items
  SELECT jsonb_agg(jsonb_build_object(
    'cocktail_id', si.cocktail_id,
    'name', c.name,
    'quantity', si.quantity,
    'type', 'menu_item'
  ))
  INTO v_items_array
  FROM sale_items si
  JOIN cocktails c ON c.id = si.cocktail_id
  WHERE si.sale_id = p_sale_id;
  
  -- Generate new token
  v_token := generate_qr_token();
  v_expires_at := now() + interval '2 hours';
  
  INSERT INTO pickup_tokens (
    sale_id,
    token,
    expires_at,
    source_type,
    venue_id,
    jornada_id,
    metadata
  ) VALUES (
    p_sale_id,
    v_token,
    v_expires_at,
    'sale',
    v_sale_record.venue_id,
    v_sale_record.jornada_id,
    jsonb_build_object(
      'type', 'menu_items',
      'sale_number', v_sale_record.sale_number,
      'items', COALESCE(v_items_array, '[]'::jsonb)
    )
  )
  RETURNING id INTO v_token_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'bar_name', null
  );
END;
$function$;

-- Update create_ticket_sale_with_covers to include venue_id, jornada_id, and delivery payload
CREATE OR REPLACE FUNCTION public.create_ticket_sale_with_covers(
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_jornada_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_worker_id uuid;
  v_venue_id uuid;
  v_ticket_sale_id uuid;
  v_ticket_number text;
  v_total integer := 0;
  v_item jsonb;
  v_ticket_type record;
  v_cocktail record;
  v_tokens jsonb := '[]'::jsonb;
  v_token_record record;
  v_cover_count integer;
  i integer;
BEGIN
  v_worker_id := auth.uid();
  
  IF NOT (has_role(v_worker_id, 'ticket_seller') OR has_role(v_worker_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tiene permisos para vender entradas');
  END IF;
  
  IF p_venue_id IS NULL THEN
    SELECT venue_id INTO v_venue_id FROM profiles WHERE id = v_worker_id;
  ELSE
    v_venue_id := p_venue_id;
  END IF;
  
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venue no encontrado');
  END IF;
  
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay items en la venta');
  END IF;
  
  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid 
      AND is_active = true
      AND venue_id = v_venue_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de entrada no válido');
    END IF;
    
    v_total := v_total + (v_ticket_type.price * (v_item->>'quantity')::integer);
  END LOOP;
  
  -- Generate ticket number
  v_ticket_number := generate_ticket_number();
  
  -- Create ticket sale
  INSERT INTO ticket_sales (
    venue_id, ticket_number, sold_by_worker_id, jornada_id, total, payment_method, payment_status
  ) VALUES (
    v_venue_id, v_ticket_number, v_worker_id, p_jornada_id, v_total, p_payment_method::payment_method, 'paid'
  ) RETURNING id INTO v_ticket_sale_id;
  
  -- Create sale items and cover tokens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid;
    
    -- Insert ticket sale item
    INSERT INTO ticket_sale_items (
      ticket_sale_id, ticket_type_id, quantity, unit_price, line_total
    ) VALUES (
      v_ticket_sale_id,
      v_ticket_type.id,
      (v_item->>'quantity')::integer,
      v_ticket_type.price,
      v_ticket_type.price * (v_item->>'quantity')::integer
    );
    
    -- Create cover tokens if ticket includes cover
    IF v_ticket_type.includes_cover AND v_ticket_type.cover_cocktail_id IS NOT NULL THEN
      -- Get cocktail info for delivery payload
      SELECT name INTO v_cocktail FROM cocktails WHERE id = v_ticket_type.cover_cocktail_id;
      
      v_cover_count := v_ticket_type.cover_quantity * (v_item->>'quantity')::integer;
      
      FOR i IN 1..v_cover_count LOOP
        INSERT INTO pickup_tokens (
          sale_id,
          source_type,
          ticket_sale_id,
          cover_cocktail_id,
          cover_quantity,
          status,
          expires_at,
          venue_id,
          jornada_id,
          metadata
        ) VALUES (
          NULL,
          'ticket',
          v_ticket_sale_id,
          v_ticket_type.cover_cocktail_id,
          1,
          'issued',
          now() + interval '24 hours',
          v_venue_id,
          p_jornada_id,
          jsonb_build_object(
            'type', 'cover',
            'ticket_number', v_ticket_number,
            'ticket_type', v_ticket_type.name,
            'items', jsonb_build_array(jsonb_build_object(
              'cocktail_id', v_ticket_type.cover_cocktail_id,
              'name', v_cocktail.name,
              'quantity', 1,
              'type', 'cover'
            ))
          )
        ) RETURNING * INTO v_token_record;
        
        v_tokens := v_tokens || jsonb_build_object(
          'token_id', v_token_record.id,
          'token', v_token_record.token,
          'cocktail_id', v_ticket_type.cover_cocktail_id,
          'cocktail_name', v_cocktail.name,
          'ticket_type', v_ticket_type.name
        );
      END LOOP;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'ticket_sale_id', v_ticket_sale_id,
    'ticket_number', v_ticket_number,
    'total', v_total,
    'cover_tokens', v_tokens
  );
END;
$function$;

-- Update cancel_sale_stock to ONLY mark tokens as cancelled, never touch stock
-- Stock is only restored if already redeemed (per DiStock Golden Rule)
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
    -- Check if any sale token was redeemed (stock was deducted)
    SELECT * INTO v_token_record
    FROM pickup_tokens
    WHERE sale_id = NEW.id AND status = 'redeemed'
    LIMIT 1;
    
    -- Only restore stock if the pickup was already redeemed
    -- This is the ONLY case where cancellation touches stock
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
            notes,
            from_location_id
          ) VALUES (
            ingredient_record.product_id,
            ingredient_record.quantity * item_record.quantity,
            'entrada',
            'Cancelación post-retiro - Venta ' || NEW.sale_number,
            v_token_record.bar_location_id
          );
          
          -- Also restore stock_balances for the bar location
          IF v_token_record.bar_location_id IS NOT NULL THEN
            UPDATE stock_balances
            SET quantity = quantity + (ingredient_record.quantity * item_record.quantity), updated_at = now()
            WHERE product_id = ingredient_record.product_id
              AND location_id = v_token_record.bar_location_id;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
    
    -- Cancel ALL pending pickup tokens (non-redeemable)
    UPDATE pickup_tokens
    SET status = 'cancelled'
    WHERE sale_id = NEW.id AND status = 'issued';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add comment documenting standardized token issuance
COMMENT ON TABLE public.pickup_tokens IS 
'Unified QR pickup tokens for both alcohol sales and ticket covers.
DiStock Golden Rule: These tokens represent "rights to pickup" - inventory is ONLY deducted on redemption via redeem_pickup_token().
Creating/cancelling sales does NOT affect stock. Cancellation marks pending tokens as cancelled.';