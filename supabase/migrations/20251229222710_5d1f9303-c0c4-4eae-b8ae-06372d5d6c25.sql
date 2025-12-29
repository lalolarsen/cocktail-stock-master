-- Update generate_pickup_token function to use UUID-based token generation
CREATE OR REPLACE FUNCTION public.generate_pickup_token(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Use UUID-based token generation (16 char hex, no pgcrypto needed)
  v_new_token := substr(encode(uuid_send(gen_random_uuid()), 'hex'), 1, 16);
  
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
$function$;

-- Update the default for token column to use UUID-based generation
ALTER TABLE pickup_tokens 
ALTER COLUMN token SET DEFAULT substr(encode(uuid_send(gen_random_uuid()), 'hex'), 1, 16);

-- Ensure unique constraint exists on token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'pickup_tokens' 
    AND indexname = 'pickup_tokens_token_key'
  ) THEN
    ALTER TABLE pickup_tokens ADD CONSTRAINT pickup_tokens_token_key UNIQUE (token);
  END IF;
END $$;