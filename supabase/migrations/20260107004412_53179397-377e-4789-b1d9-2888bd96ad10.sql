-- 2) Create ticket_types table
CREATE TABLE public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  price integer NOT NULL,
  includes_cover boolean DEFAULT false,
  cover_cocktail_id uuid REFERENCES public.cocktails(id) ON DELETE SET NULL,
  cover_quantity integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ticket_types_venue ON public.ticket_types(venue_id);
CREATE INDEX idx_ticket_types_active ON public.ticket_types(venue_id, is_active);

-- 3) Create ticket_sales table
CREATE TABLE public.ticket_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  ticket_number text UNIQUE NOT NULL,
  sold_by_worker_id uuid NOT NULL REFERENCES public.profiles(id),
  jornada_id uuid REFERENCES public.jornadas(id),
  total integer NOT NULL,
  payment_method public.payment_method DEFAULT 'cash',
  payment_status text NOT NULL DEFAULT 'paid',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ticket_sales_venue ON public.ticket_sales(venue_id);
CREATE INDEX idx_ticket_sales_worker ON public.ticket_sales(sold_by_worker_id);
CREATE INDEX idx_ticket_sales_jornada ON public.ticket_sales(jornada_id);

-- 4) Create ticket_sale_items table
CREATE TABLE public.ticket_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_sale_id uuid NOT NULL REFERENCES public.ticket_sales(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id),
  quantity integer NOT NULL,
  unit_price integer NOT NULL,
  line_total integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ticket_sale_items_sale ON public.ticket_sale_items(ticket_sale_id);

-- 5) Extend pickup_tokens for cover support
ALTER TABLE public.pickup_tokens 
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS ticket_sale_id uuid REFERENCES public.ticket_sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_cocktail_id uuid REFERENCES public.cocktails(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_quantity integer DEFAULT 1;

-- 6) Enable RLS
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sale_items ENABLE ROW LEVEL SECURITY;

-- 7) RLS Policies for ticket_types
CREATE POLICY "Admins can manage ticket types"
  ON public.ticket_types FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view ticket types"
  ON public.ticket_types FOR SELECT
  USING (has_role(auth.uid(), 'gerencia'));

CREATE POLICY "Ticket sellers can view active ticket types"
  ON public.ticket_types FOR SELECT
  USING (has_role(auth.uid(), 'ticket_seller') AND is_active = true);

-- 8) RLS Policies for ticket_sales
CREATE POLICY "Admins can manage ticket sales"
  ON public.ticket_sales FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view ticket sales"
  ON public.ticket_sales FOR SELECT
  USING (has_role(auth.uid(), 'gerencia'));

CREATE POLICY "Ticket sellers can create ticket sales"
  ON public.ticket_sales FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'ticket_seller') AND sold_by_worker_id = auth.uid());

CREATE POLICY "Ticket sellers can view own ticket sales"
  ON public.ticket_sales FOR SELECT
  USING (has_role(auth.uid(), 'ticket_seller') AND sold_by_worker_id = auth.uid());

-- 9) RLS Policies for ticket_sale_items
CREATE POLICY "Admins can manage ticket sale items"
  ON public.ticket_sale_items FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view ticket sale items"
  ON public.ticket_sale_items FOR SELECT
  USING (has_role(auth.uid(), 'gerencia'));

CREATE POLICY "Ticket sellers can create ticket sale items"
  ON public.ticket_sale_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ticket_sales ts
    WHERE ts.id = ticket_sale_items.ticket_sale_id
    AND ts.sold_by_worker_id = auth.uid()
    AND has_role(auth.uid(), 'ticket_seller')
  ));

CREATE POLICY "Ticket sellers can view own ticket sale items"
  ON public.ticket_sale_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ticket_sales ts
    WHERE ts.id = ticket_sale_items.ticket_sale_id
    AND ts.sold_by_worker_id = auth.uid()
  ));

-- 10) Update pickup_tokens RLS for ticket sellers
CREATE POLICY "Ticket sellers can create cover tokens"
  ON public.pickup_tokens FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'ticket_seller') 
    AND source_type = 'ticket'
    AND EXISTS (
      SELECT 1 FROM public.ticket_sales ts
      WHERE ts.id = pickup_tokens.ticket_sale_id
      AND ts.sold_by_worker_id = auth.uid()
    )
  );

CREATE POLICY "Ticket sellers can view own ticket tokens"
  ON public.pickup_tokens FOR SELECT
  USING (
    has_role(auth.uid(), 'ticket_seller')
    AND source_type = 'ticket'
    AND EXISTS (
      SELECT 1 FROM public.ticket_sales ts
      WHERE ts.id = pickup_tokens.ticket_sale_id
      AND ts.sold_by_worker_id = auth.uid()
    )
  );

-- 11) Generate ticket number function
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_number text;
BEGIN
  v_number := 'T-' || to_char(now(), 'YYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  RETURN v_number;
END;
$$;

-- 12) Create RPC for ticket sale with cover tokens
CREATE OR REPLACE FUNCTION public.create_ticket_sale_with_covers(
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_jornada_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_venue_id uuid;
  v_ticket_sale_id uuid;
  v_ticket_number text;
  v_total integer := 0;
  v_item jsonb;
  v_ticket_type record;
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
  
  v_ticket_number := generate_ticket_number();
  
  INSERT INTO ticket_sales (
    venue_id, ticket_number, sold_by_worker_id, jornada_id, total, payment_method, payment_status
  ) VALUES (
    v_venue_id, v_ticket_number, v_worker_id, p_jornada_id, v_total, p_payment_method::payment_method, 'paid'
  ) RETURNING id INTO v_ticket_sale_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid;
    
    INSERT INTO ticket_sale_items (
      ticket_sale_id, ticket_type_id, quantity, unit_price, line_total
    ) VALUES (
      v_ticket_sale_id,
      v_ticket_type.id,
      (v_item->>'quantity')::integer,
      v_ticket_type.price,
      v_ticket_type.price * (v_item->>'quantity')::integer
    );
    
    IF v_ticket_type.includes_cover AND v_ticket_type.cover_cocktail_id IS NOT NULL THEN
      v_cover_count := v_ticket_type.cover_quantity * (v_item->>'quantity')::integer;
      
      FOR i IN 1..v_cover_count LOOP
        INSERT INTO pickup_tokens (
          sale_id,
          source_type,
          ticket_sale_id,
          cover_cocktail_id,
          cover_quantity,
          status,
          expires_at
        ) VALUES (
          NULL,
          'ticket',
          v_ticket_sale_id,
          v_ticket_type.cover_cocktail_id,
          1,
          'issued',
          now() + interval '24 hours'
        ) RETURNING * INTO v_token_record;
        
        v_tokens := v_tokens || jsonb_build_object(
          'token_id', v_token_record.id,
          'token', v_token_record.token,
          'cocktail_id', v_ticket_type.cover_cocktail_id,
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
$$;

-- 13) Update redeem_pickup_token to handle cover tokens
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
  v_active_jornada_id uuid;
  v_consumption_result jsonb;
  v_missing_items jsonb := '[]'::jsonb;
  v_venue_is_demo boolean := false;
  v_item record;
BEGIN
  -- Find token (handle both sale and ticket tokens)
  SELECT pt.*, 
         s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
         s.bar_location_id as sale_bar_location_id, 
         COALESCE(s.venue_id, ts.venue_id) as venue_id
  INTO v_token_record
  FROM pickup_tokens pt
  LEFT JOIN sales s ON s.id = pt.sale_id
  LEFT JOIN ticket_sales ts ON ts.id = pt.ticket_sale_id
  WHERE pt.token = p_token;

  IF NOT FOUND THEN
    INSERT INTO pickup_redemptions_log (bartender_id, result, metadata)
    VALUES (auth.uid(), 'not_found', jsonb_build_object('token', p_token));
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_token_record.venue_id;

  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id);
  IF v_bar_location_id IS NULL THEN
    SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'bar' AND is_active = true LIMIT 1;
  END IF;

  IF v_token_record.status = 'redeemed' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'already_redeemed', 
            jsonb_build_object('redeemed_at', v_token_record.redeemed_at));
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED');
  END IF;

  IF v_token_record.status = 'expired' OR v_token_record.expires_at < now() THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'expired');
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED');
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'cancelled');
    RETURN jsonb_build_object('success', false, 'error', 'CANCELLED');
  END IF;

  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' LIMIT 1;

  -- Handle cover token (from ticket sale)
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_COVER');
    END IF;

    FOR v_ingredient IN
      SELECT ci.product_id, ci.quantity, p.name as product_name
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
        p_pickup_token_id := v_token_record.id
      );

      IF NOT (v_consumption_result->>'success')::boolean THEN
        v_missing_items := v_missing_items || jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'error', v_consumption_result->>'error'
        );
      END IF;
    END LOOP;

    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, result, metadata)
      VALUES (auth.uid(), v_token_record.id, 'stock_error', jsonb_build_object('missing_items', v_missing_items));
      RETURN jsonb_build_object('success', false, 'error', 'STOCK_ERROR', 'missing_items', v_missing_items);
    END IF;

    UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid() WHERE id = v_token_record.id;

    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, 'success', jsonb_build_object('type', 'cover', 'cocktail', v_cocktail.name));

    RETURN jsonb_build_object('success', true, 'message', 'Cover entregado: ' || v_cocktail.name);
  END IF;

  -- Handle regular sale token
  IF v_token_record.is_cancelled THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'cancelled');
    RETURN jsonb_build_object('success', false, 'error', 'CANCELLED');
  END IF;

  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'unpaid');
    RETURN jsonb_build_object('success', false, 'error', 'UNPAID');
  END IF;

  FOR v_item IN
    SELECT ci.product_id, p.name as product_name, SUM(ci.quantity * si.quantity) as total_quantity
    FROM sale_items si
    JOIN cocktail_ingredients ci ON ci.cocktail_id = si.cocktail_id
    JOIN products p ON p.id = ci.product_id
    WHERE si.sale_id = v_token_record.sale_id
    GROUP BY ci.product_id, p.name
  LOOP
    v_consumption_result := consume_stock_fefo(
      p_product_id := v_item.product_id,
      p_location_id := v_bar_location_id,
      p_quantity := v_item.total_quantity,
      p_allow_expired := v_venue_is_demo,
      p_jornada_id := v_active_jornada_id,
      p_notes := 'QR: ' || v_token_record.sale_number,
      p_pickup_token_id := v_token_record.id
    );

    IF NOT (v_consumption_result->>'success')::boolean THEN
      v_missing_items := v_missing_items || jsonb_build_object(
        'product_name', v_item.product_name,
        'error', v_consumption_result->>'error'
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_missing_items) > 0 THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
    VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'stock_error', jsonb_build_object('missing_items', v_missing_items));
    RETURN jsonb_build_object('success', false, 'error', 'STOCK_ERROR', 'missing_items', v_missing_items);
  END IF;

  UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid() WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, metadata)
  VALUES (auth.uid(), v_token_record.id, v_token_record.sale_id, 'success', jsonb_build_object('bar_location_id', v_bar_location_id));

  RETURN jsonb_build_object('success', true, 'sale_number', v_token_record.sale_number, 'total_amount', v_token_record.total_amount);
END;
$$;