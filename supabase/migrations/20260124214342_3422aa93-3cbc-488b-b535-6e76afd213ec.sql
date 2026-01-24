-- Create developer_feature_flags table
CREATE TABLE IF NOT EXISTS public.developer_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (venue_id, key)
);

-- Create developer_flag_audit table (append-only)
CREATE TABLE IF NOT EXISTS public.developer_flag_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  key text NOT NULL,
  from_enabled boolean,
  to_enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on both tables
ALTER TABLE public.developer_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_flag_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for developer_feature_flags
CREATE POLICY "Developers can read feature flags"
  ON public.developer_feature_flags
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can insert feature flags"
  ON public.developer_feature_flags
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can update feature flags"
  ON public.developer_feature_flags
  FOR UPDATE
  USING (has_role(auth.uid(), 'developer'::app_role));

-- RLS policies for developer_flag_audit (append-only: SELECT and INSERT only)
CREATE POLICY "Developers can read flag audit"
  ON public.developer_flag_audit
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can insert flag audit"
  ON public.developer_flag_audit
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

-- RPC function to set feature flag with audit logging
CREATE OR REPLACE FUNCTION public.dev_set_feature_flag(
  p_venue_id uuid,
  p_key text,
  p_is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_enabled boolean;
  v_result jsonb;
BEGIN
  -- Verify caller has developer role
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: developer role required');
  END IF;

  -- Get current value if exists
  SELECT is_enabled INTO v_old_enabled
  FROM developer_feature_flags
  WHERE venue_id = p_venue_id AND key = p_key;

  -- Upsert the flag
  INSERT INTO developer_feature_flags (venue_id, key, is_enabled, updated_at, updated_by)
  VALUES (p_venue_id, p_key, p_is_enabled, now(), auth.uid())
  ON CONFLICT (venue_id, key)
  DO UPDATE SET 
    is_enabled = p_is_enabled,
    updated_at = now(),
    updated_by = auth.uid();

  -- Write audit log
  INSERT INTO developer_flag_audit (venue_id, key, from_enabled, to_enabled, changed_by)
  VALUES (p_venue_id, p_key, v_old_enabled, p_is_enabled, auth.uid());

  -- Return updated row
  SELECT jsonb_build_object(
    'success', true,
    'venue_id', venue_id,
    'key', key,
    'is_enabled', is_enabled,
    'updated_at', updated_at
  ) INTO v_result
  FROM developer_feature_flags
  WHERE venue_id = p_venue_id AND key = p_key;

  RETURN v_result;
END;
$$;

-- RPC to reset flags to stable v1.0 defaults
CREATE OR REPLACE FUNCTION public.dev_reset_flags_to_stable(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stable_flags jsonb := '{
    "FEATURE_TICKETS": false,
    "FEATURE_QR_REDEMPTION": true,
    "FEATURE_MULTI_POS": false,
    "FEATURE_INVOICING": false,
    "FEATURE_EXPIRES_TRACKING": false,
    "FEATURE_INVOICE_STOCK_READER": false
  }'::jsonb;
  v_key text;
  v_enabled boolean;
  v_count int := 0;
BEGIN
  -- Verify caller has developer role
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Iterate stable flags and set each
  FOR v_key, v_enabled IN SELECT key, value::boolean FROM jsonb_each_text(v_stable_flags)
  LOOP
    PERFORM dev_set_feature_flag(p_venue_id, v_key, v_enabled);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'flags_set', v_count);
END;
$$;

-- RPC to recalculate jornada summaries (wrapper for existing function)
CREATE OR REPLACE FUNCTION public.dev_recalculate_jornada_summaries(p_jornada_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  -- Verify caller has developer role
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get venue_id from jornada
  SELECT venue_id INTO v_venue_id FROM jornadas WHERE id = p_jornada_id;
  
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada not found');
  END IF;

  -- Delete existing summaries for this jornada
  DELETE FROM jornada_financial_summary WHERE jornada_id = p_jornada_id;

  -- Regenerate summaries
  PERFORM generate_jornada_financial_summaries(p_jornada_id, auth.uid());

  RETURN jsonb_build_object('success', true, 'jornada_id', p_jornada_id);
END;
$$;

-- RPC to expire old pending tokens
CREATE OR REPLACE FUNCTION public.dev_expire_old_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Verify caller has developer role
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Update tokens past expiry that are still pending/issued
  UPDATE pickup_tokens
  SET status = 'expired'
  WHERE status IN ('pending', 'issued')
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$$;

-- Seed default v1.0 flags for existing venues that don't have them
INSERT INTO developer_feature_flags (venue_id, key, is_enabled)
SELECT v.id, f.key, f.is_enabled
FROM venues v
CROSS JOIN (
  VALUES 
    ('FEATURE_TICKETS', false),
    ('FEATURE_QR_REDEMPTION', true),
    ('FEATURE_MULTI_POS', false),
    ('FEATURE_INVOICING', false),
    ('FEATURE_EXPIRES_TRACKING', false),
    ('FEATURE_INVOICE_STOCK_READER', false)
) AS f(key, is_enabled)
WHERE NOT EXISTS (
  SELECT 1 FROM developer_feature_flags dff 
  WHERE dff.venue_id = v.id AND dff.key = f.key
)
ON CONFLICT (venue_id, key) DO NOTHING;