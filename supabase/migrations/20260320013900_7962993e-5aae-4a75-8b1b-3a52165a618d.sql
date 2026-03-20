-- RPC for Gerencia/Admin/Developer to toggle inventory freeze mode
CREATE OR REPLACE FUNCTION public.set_inventory_freeze_mode(p_enabled boolean, p_venue_id uuid DEFAULT public.get_user_venue_id())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_venue_id IS NULL OR p_venue_id != public.get_user_venue_id() THEN
    RAISE EXCEPTION 'Venue mismatch or no venue assigned';
  END IF;

  INSERT INTO public.venue_feature_flags (venue_id, flag_key, enabled, updated_at)
  VALUES (p_venue_id, 'inventory_freeze_mode', p_enabled, now())
  ON CONFLICT (venue_id, flag_key)
  DO UPDATE SET enabled = p_enabled, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_inventory_freeze_mode(boolean, uuid) TO authenticated;

-- Update is_inventory_frozen to read venue_feature_flags first
CREATE OR REPLACE FUNCTION public.is_inventory_frozen(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM venue_feature_flags WHERE venue_id = p_venue_id AND flag_key = 'inventory_freeze_mode' LIMIT 1),
    (SELECT enabled FROM feature_flags WHERE venue_id = p_venue_id AND feature_key = 'inventory_freeze_mode' LIMIT 1),
    (SELECT default_enabled FROM feature_flags_master WHERE key = 'inventory_freeze_mode' LIMIT 1),
    false
  );
$$;