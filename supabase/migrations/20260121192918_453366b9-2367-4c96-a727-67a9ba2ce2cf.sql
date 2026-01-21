-- 1) Create safe token generator without pgcrypto dependency
CREATE OR REPLACE FUNCTION public.generate_qr_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_attempts int := 0;
  v_max_attempts int := 5;
BEGIN
  LOOP
    -- Generate token using multiple entropy sources (no extensions required)
    v_token := md5(
      random()::text ||
      clock_timestamp()::text ||
      pg_backend_pid()::text ||
      (random() * 1e18)::text ||
      txid_current()::text
    );
    
    -- Check if token is unique
    IF NOT EXISTS (SELECT 1 FROM pickup_tokens WHERE token = v_token) THEN
      RETURN v_token;
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique token after % attempts', v_max_attempts;
    END IF;
  END LOOP;
END;
$$;

-- 2) Add unique constraint on pickup_tokens.token if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'pickup_tokens' AND indexname = 'pickup_tokens_token_key'
  ) THEN
    ALTER TABLE pickup_tokens ADD CONSTRAINT pickup_tokens_token_key UNIQUE (token);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  -- Constraint already exists, ignore
  NULL;
END $$;

-- 3) Replace generate_pickup_token function to use new token generator
CREATE OR REPLACE FUNCTION public.generate_pickup_token(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_sale_record record;
BEGIN
  -- Get sale info
  SELECT id, venue_id, sale_number INTO v_sale_record
  FROM sales
  WHERE id = p_sale_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sale not found');
  END IF;
  
  -- Check if token already exists for this sale
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
  
  -- Generate new token using safe function (no extensions required)
  v_token := generate_qr_token();
  v_expires_at := now() + interval '2 hours';
  
  INSERT INTO pickup_tokens (
    sale_id,
    token,
    expires_at,
    source_type,
    bar_location_id
  ) VALUES (
    p_sale_id,
    v_token,
    v_expires_at,
    'sale',
    NULL
  )
  RETURNING id INTO v_token_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'bar_name', null
  );
END;
$$;