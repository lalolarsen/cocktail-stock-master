-- Add ticket_seller to the app_role enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'ticket_seller'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'ticket_seller';
  END IF;
END $$;

-- Create demo logging table for enhanced event tracking
CREATE TABLE IF NOT EXISTS public.demo_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  user_role text,
  user_id uuid,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on demo_event_logs
ALTER TABLE public.demo_event_logs ENABLE ROW LEVEL SECURITY;

-- Policy: anyone in demo venue can insert and read
CREATE POLICY "Demo venue members can manage demo logs" ON public.demo_event_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.venue_id = demo_event_logs.venue_id
    )
  );

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_demo_event_logs_venue_event 
  ON demo_event_logs(venue_id, event_type, created_at DESC);

-- Update generate_pickup_token to NOT require bar_location_id
-- Tokens should be bar-agnostic until redemption
CREATE OR REPLACE FUNCTION public.generate_pickup_token(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_sale_record record;
BEGIN
  -- Get sale info (no bar required)
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
  
  -- Generate new token
  v_token := encode(gen_random_bytes(16), 'hex');
  v_expires_at := now() + interval '2 hours';
  
  INSERT INTO pickup_tokens (
    sale_id,
    token,
    expires_at,
    source_type,
    bar_location_id -- NULL - will be determined at redemption
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