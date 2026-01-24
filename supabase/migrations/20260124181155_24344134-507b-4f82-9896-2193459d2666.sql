-- Add updated_at column to feature_flags if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'feature_flags' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.feature_flags ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_feature_flags_updated_at();

-- Create RPC: is_feature_enabled(flag_key text) returns boolean
-- Resolves venue_id from current user profile and returns enabled status
CREATE OR REPLACE FUNCTION public.is_feature_enabled(flag_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id UUID;
  v_enabled BOOLEAN;
BEGIN
  -- Get venue_id from current user's profile
  SELECT venue_id INTO v_venue_id
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF v_venue_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check feature flag status
  SELECT enabled INTO v_enabled
  FROM public.feature_flags
  WHERE venue_id = v_venue_id
    AND feature_key = flag_key;
  
  -- Return false if flag doesn't exist
  RETURN COALESCE(v_enabled, FALSE);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT) TO authenticated;