-- ============================================
-- DiStock Database Schema Export
-- Part 10: Helper Functions
-- ============================================

-- ============================================
-- ROLE CHECKING FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check worker_roles first (current system)
  IF EXISTS (
    SELECT 1 FROM worker_roles 
    WHERE worker_id = p_user_id AND role = p_role
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Fallback to user_roles (legacy)
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = p_user_id AND role = p_role
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$function$;

-- ============================================
-- GET USER VENUE ID
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_venue_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT venue_id FROM profiles WHERE id = auth.uid()
$function$;

-- ============================================
-- GET VENUE FLAGS
-- ============================================

CREATE OR REPLACE FUNCTION public.get_venue_flags(p_venue_id UUID)
RETURNS TABLE(flag_key TEXT, enabled BOOLEAN)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(dff.key, ff.feature_key) as flag_key,
    COALESCE(dff.is_enabled, ff.enabled, false) as enabled
  FROM developer_feature_flags dff
  FULL OUTER JOIN feature_flags ff 
    ON dff.venue_id = ff.venue_id AND dff.key = ff.feature_key
  WHERE dff.venue_id = p_venue_id OR ff.venue_id = p_venue_id;
END;
$function$;

-- ============================================
-- GET SIDEBAR CONFIG
-- ============================================

CREATE OR REPLACE FUNCTION public.get_sidebar_config(p_venue_id UUID, p_role TEXT)
RETURNS TABLE(
  menu_key TEXT,
  menu_label TEXT,
  icon_name TEXT,
  view_type TEXT,
  feature_flag TEXT,
  external_path TEXT,
  is_enabled BOOLEAN
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    sc.menu_key,
    sc.menu_label,
    sc.icon_name,
    sc.view_type,
    sc.feature_flag,
    sc.external_path,
    sc.is_enabled
  FROM sidebar_config sc
  WHERE sc.venue_id = p_venue_id AND sc.role = p_role
  ORDER BY sc.sort_order;
END;
$function$;

-- ============================================
-- IS FEATURE ENABLED
-- ============================================

CREATE OR REPLACE FUNCTION public.is_feature_enabled(flag_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_id UUID;
  v_enabled BOOLEAN;
BEGIN
  -- Get user's venue
  SELECT venue_id INTO v_venue_id FROM profiles WHERE id = auth.uid();
  
  IF v_venue_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check feature flag status
  SELECT enabled INTO v_enabled
  FROM feature_flags
  WHERE venue_id = v_venue_id AND feature_key = flag_key;
  
  RETURN COALESCE(v_enabled, FALSE);
END;
$function$;

-- ============================================
-- LOG ADMIN ACTION
-- ============================================

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT,
  p_target_worker_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO admin_audit_logs (admin_id, action, target_worker_id, details, venue_id)
  VALUES (auth.uid(), p_action, p_target_worker_id, p_details, get_user_venue_id())
  RETURNING id
$function$;

-- ============================================
-- LOG AUDIT EVENT
-- ============================================

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_status TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_venue_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO app_audit_events (venue_id, user_id, action, status, metadata)
  VALUES (p_venue_id, COALESCE(p_user_id, auth.uid()), p_action, p_status, p_metadata)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$function$;

-- ============================================
-- RECORD LOGIN ATTEMPT
-- ============================================

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_rut_code TEXT,
  p_venue_id UUID,
  p_success BOOLEAN,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO login_attempts (rut_code, venue_id, success, ip_address, user_agent)
  VALUES (p_rut_code, p_venue_id, p_success, p_ip_address, p_user_agent)
$function$;

-- ============================================
-- VALIDATE COCKTAIL COST
-- ============================================

CREATE OR REPLACE FUNCTION public.validate_cocktail_cost(p_cocktail_id UUID)
RETURNS TABLE(is_valid BOOLEAN, total_cost NUMERIC, missing_ingredients JSONB)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC := 0;
  v_missing JSONB := '[]'::jsonb;
  v_ingredient RECORD;
BEGIN
  FOR v_ingredient IN
    SELECT ci.*, p.name as product_name, p.cost_per_unit
    FROM cocktail_ingredients ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cocktail_id = p_cocktail_id
  LOOP
    IF v_ingredient.cost_per_unit IS NULL OR v_ingredient.cost_per_unit <= 0 THEN
      v_missing := v_missing || jsonb_build_object(
        'product_id', v_ingredient.product_id,
        'product_name', v_ingredient.product_name,
        'issue', 'missing_cost'
      );
    ELSE
      v_total := v_total + (v_ingredient.quantity * v_ingredient.cost_per_unit);
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    jsonb_array_length(v_missing) = 0,
    v_total,
    v_missing;
END;
$function$;
