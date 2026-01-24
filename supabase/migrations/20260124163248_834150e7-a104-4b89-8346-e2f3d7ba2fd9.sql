-- Fix create_ticket_sale_with_covers to set sale_id = NULL for ticket tokens
-- The sale_id column should only be populated for bar/alcohol sales, not ticket covers

CREATE OR REPLACE FUNCTION public.create_ticket_sale_with_covers(
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_jornada_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_pos_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_venue_id uuid;
  v_ticket_sale_id uuid;
  v_ticket_number text;
  v_total integer := 0;
  v_item jsonb;
  v_ticket_type record;
  v_jornada_id uuid;
  v_cover_tokens jsonb := '[]'::jsonb;
  v_token_id uuid;
  v_token text;
  i integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get venue_id from user profile if not provided
  IF p_venue_id IS NULL THEN
    SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  ELSE
    v_venue_id := p_venue_id;
  END IF;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Venue not found for user';
  END IF;

  -- Use provided jornada_id or find active one
  IF p_jornada_id IS NOT NULL THEN
    v_jornada_id := p_jornada_id;
  ELSE
    SELECT id INTO v_jornada_id 
    FROM public.jornadas 
    WHERE estado = 'activa' 
    AND (venue_id = v_venue_id OR venue_id IS NULL)
    LIMIT 1;
  END IF;

  -- Generate ticket number
  v_ticket_number := 'TKT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  -- Calculate total from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM public.ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid;
    
    IF v_ticket_type IS NULL THEN
      RAISE EXCEPTION 'Invalid ticket type: %', v_item->>'ticket_type_id';
    END IF;
    
    v_total := v_total + (v_ticket_type.price * COALESCE((v_item->>'quantity')::int, 1));
  END LOOP;

  -- Create ticket sale record
  INSERT INTO public.ticket_sales (
    venue_id,
    sold_by_worker_id,
    ticket_number,
    total,
    payment_method,
    payment_status,
    jornada_id,
    pos_id
  ) VALUES (
    v_venue_id,
    v_user_id,
    v_ticket_number,
    v_total,
    COALESCE(p_payment_method, 'cash')::payment_method,
    'paid',
    v_jornada_id,
    p_pos_id
  )
  RETURNING id INTO v_ticket_sale_id;

  -- Create ticket sale items and pickup tokens for covers
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM public.ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid;

    -- Insert ticket sale item
    INSERT INTO public.ticket_sale_items (
      ticket_sale_id,
      ticket_type_id,
      quantity,
      unit_price,
      line_total
    ) VALUES (
      v_ticket_sale_id,
      v_ticket_type.id,
      COALESCE((v_item->>'quantity')::int, 1),
      v_ticket_type.price,
      v_ticket_type.price * COALESCE((v_item->>'quantity')::int, 1)
    );

    -- Create pickup tokens for covers (one per ticket purchased)
    IF v_ticket_type.includes_cover AND v_ticket_type.cover_cocktail_id IS NOT NULL THEN
      FOR i IN 1..COALESCE((v_item->>'quantity')::int, 1) LOOP
        INSERT INTO public.pickup_tokens (
          sale_id,           -- NULL for ticket covers (not from bar sales)
          ticket_sale_id,    -- Reference to ticket_sales table
          venue_id,
          jornada_id,
          status,
          source_type,
          cover_cocktail_id,
          cover_quantity,
          expires_at,
          metadata
        ) VALUES (
          NULL,              -- FIXED: sale_id must be NULL for ticket tokens
          v_ticket_sale_id,  -- Reference to ticket_sales
          v_venue_id,
          v_jornada_id,
          'issued',          -- FIXED: use 'issued' not 'pending' to match enum
          'ticket',
          v_ticket_type.cover_cocktail_id,
          v_ticket_type.cover_quantity,
          now() + interval '12 hours',
          jsonb_build_object(
            'ticket_number', v_ticket_number,
            'ticket_type_name', v_ticket_type.name,
            'cover_quantity', v_ticket_type.cover_quantity
          )
        )
        RETURNING id, token INTO v_token_id, v_token;

        -- Add token to result array
        v_cover_tokens := v_cover_tokens || jsonb_build_object(
          'token_id', v_token_id,
          'token', v_token,
          'cocktail_id', v_ticket_type.cover_cocktail_id,
          'ticket_type', v_ticket_type.name
        );
      END LOOP;
    END IF;
  END LOOP;

  -- Return result
  RETURN jsonb_build_object(
    'ticket_sale_id', v_ticket_sale_id,
    'ticket_number', v_ticket_number,
    'total', v_total,
    'cover_tokens', v_cover_tokens
  );
END;
$$;