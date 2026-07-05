-- 1. Add failure_reason column (nullable, preserves history)
ALTER TABLE public.login_attempts
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- 2. Extend record_login_attempt with optional reason (backwards compatible)
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_rut_code text,
  p_venue_id uuid,
  p_success boolean,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.login_attempts (rut_code, venue_id, success, ip_address, user_agent, failure_reason)
  VALUES (p_rut_code, p_venue_id, p_success, p_ip_address, p_user_agent, p_failure_reason)
$$;

-- 3. Only 'invalid_pin' (or legacy NULL) count toward lockout
CREATE OR REPLACE FUNCTION public.is_account_locked(p_rut_code text, p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_success AS (
    SELECT COALESCE(MAX(attempted_at), 'epoch'::timestamptz) AS ts
    FROM public.login_attempts
    WHERE rut_code = p_rut_code
      AND (venue_id = p_venue_id OR (venue_id IS NULL AND p_venue_id IS NULL))
      AND success = true
  )
  SELECT COUNT(*) >= 8
  FROM public.login_attempts la, last_success
  WHERE la.rut_code = p_rut_code
    AND (la.venue_id = p_venue_id OR (la.venue_id IS NULL AND p_venue_id IS NULL))
    AND la.success = false
    AND (la.failure_reason IS NULL OR la.failure_reason = 'invalid_pin')
    AND la.attempted_at > GREATEST(now() - interval '10 minutes', last_success.ts)
$$;

CREATE OR REPLACE FUNCTION public.get_lock_status(p_rut_code text, p_venue_id uuid)
RETURNS TABLE(failed_count int, minutes_remaining int, is_locked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_success AS (
    SELECT COALESCE(MAX(attempted_at), 'epoch'::timestamptz) AS ts
    FROM public.login_attempts
    WHERE rut_code = p_rut_code
      AND (venue_id = p_venue_id OR (venue_id IS NULL AND p_venue_id IS NULL))
      AND success = true
  ),
  fails AS (
    SELECT la.attempted_at
    FROM public.login_attempts la, last_success
    WHERE la.rut_code = p_rut_code
      AND (la.venue_id = p_venue_id OR (la.venue_id IS NULL AND p_venue_id IS NULL))
      AND la.success = false
      AND (la.failure_reason IS NULL OR la.failure_reason = 'invalid_pin')
      AND la.attempted_at > GREATEST(now() - interval '10 minutes', last_success.ts)
  )
  SELECT
    COUNT(*)::int AS failed_count,
    GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (MIN(attempted_at) + interval '10 minutes' - now())) / 60)::int
    ) AS minutes_remaining,
    COUNT(*) >= 8 AS is_locked
  FROM fails
$$;