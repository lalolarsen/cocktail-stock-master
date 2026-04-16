
-- 1. Update default on pickup_tokens.expires_at column
ALTER TABLE public.pickup_tokens
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '72 hours');

-- 2. Recreate generate_pickup_token with 72-hour expiration
CREATE OR REPLACE FUNCTION public.generate_pickup_token(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_short_code text;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_sale_record record;
  v_items_array jsonb;
BEGIN
  SELECT s.id, s.venue_id, s.jornada_id, s.sale_number
  INTO v_sale_record
  FROM sales s
  WHERE s.id = p_sale_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sale not found');
  END IF;
  
  -- Check if token already exists for this sale (idempotent)
  SELECT id, token, short_code, expires_at INTO v_token_id, v_token, v_short_code, v_expires_at
  FROM pickup_tokens
  WHERE sale_id = p_sale_id AND source_type = 'sale';
  
  IF v_token_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'token', v_token,
      'short_code', v_short_code,
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
  
  -- Generate new token with 72-hour expiration
  v_token := generate_qr_token();
  v_expires_at := now() + interval '72 hours';
  
  INSERT INTO pickup_tokens (
    sale_id, token, expires_at, source_type, venue_id, jornada_id, metadata
  ) VALUES (
    p_sale_id, v_token, v_expires_at, 'sale',
    v_sale_record.venue_id, v_sale_record.jornada_id,
    jsonb_build_object(
      'type', 'menu_items',
      'sale_number', v_sale_record.sale_number,
      'items', COALESCE(v_items_array, '[]'::jsonb)
    )
  )
  RETURNING id, short_code INTO v_token_id, v_short_code;
  
  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'short_code', v_short_code,
    'expires_at', v_expires_at,
    'bar_name', null
  );
END;
$function$;
