-- Drop both function versions and recreate with proper signature
DROP FUNCTION IF EXISTS public.create_ticket_sale_with_covers(jsonb, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_ticket_sale_with_covers(jsonb, text, uuid, uuid, uuid);

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
  
  -- Create ticket sale with pos_id for cash register attribution
  INSERT INTO ticket_sales (
    venue_id, 
    ticket_number, 
    sold_by_worker_id, 
    jornada_id, 
    pos_id,
    total, 
    payment_method, 
    payment_status
  ) VALUES (
    v_venue_id, 
    v_ticket_number, 
    v_worker_id, 
    p_jornada_id, 
    p_pos_id,
    v_total, 
    p_payment_method::payment_method, 
    'paid'
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
        -- Insert pickup_token with sale_id=NULL (no FK violation for ticket covers)
        INSERT INTO pickup_tokens (
          sale_id,          -- NULL: ticket covers don't reference sales table
          source_type,      -- 'ticket' to identify source
          ticket_sale_id,   -- References ticket_sales table
          cover_cocktail_id,
          cover_quantity,
          status,
          expires_at,
          venue_id,
          jornada_id,
          metadata
        ) VALUES (
          NULL,             -- CRITICAL: sale_id must be NULL for ticket tokens
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
$$;