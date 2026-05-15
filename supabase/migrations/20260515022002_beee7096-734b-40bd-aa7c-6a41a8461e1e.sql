
-- 1. Redefinir is_account_locked: 8 fallos / 10 min, reset en login exitoso
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
    AND la.attempted_at > GREATEST(now() - interval '10 minutes', last_success.ts)
$$;

-- 2. Nueva: minutos restantes y conteo de fallos efectivos
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

-- 3. Desbloquear manualmente (admin/gerencia)
CREATE OR REPLACE FUNCTION public.unlock_worker_account(p_rut_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_deleted int;
  v_worker_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = auth.uid();

  SELECT id INTO v_worker_id FROM public.profiles
   WHERE rut_code = p_rut_code AND (venue_id = v_venue_id OR venue_id IS NULL)
   LIMIT 1;

  DELETE FROM public.login_attempts
   WHERE rut_code = p_rut_code
     AND (venue_id = v_venue_id OR venue_id IS NULL)
     AND success = false
     AND attempted_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.admin_audit_logs (admin_id, action, target_worker_id, details, venue_id)
  VALUES (auth.uid(), 'unlock_worker_account', v_worker_id,
          jsonb_build_object('rut_code', p_rut_code, 'cleared_attempts', v_deleted),
          v_venue_id);

  RETURN jsonb_build_object('success', true, 'cleared_attempts', v_deleted);
END;
$$;

-- 4. Listar trabajadores bloqueados del venue actual
CREATE OR REPLACE FUNCTION public.get_locked_workers()
RETURNS TABLE(
  worker_id uuid,
  full_name text,
  rut_code text,
  failed_count int,
  minutes_remaining int,
  last_attempt_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role)) THEN
    RETURN;
  END IF;

  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = auth.uid();

  RETURN QUERY
  WITH last_success AS (
    SELECT rut_code, MAX(attempted_at) AS ts
    FROM public.login_attempts
    WHERE success = true AND (venue_id = v_venue_id OR venue_id IS NULL)
    GROUP BY rut_code
  ),
  recent_fails AS (
    SELECT la.rut_code,
           COUNT(*)::int AS fc,
           MIN(la.attempted_at) AS first_fail,
           MAX(la.attempted_at) AS last_fail
    FROM public.login_attempts la
    LEFT JOIN last_success ls ON ls.rut_code = la.rut_code
    WHERE la.success = false
      AND (la.venue_id = v_venue_id OR la.venue_id IS NULL)
      AND la.attempted_at > GREATEST(now() - interval '10 minutes', COALESCE(ls.ts, 'epoch'::timestamptz))
    GROUP BY la.rut_code
    HAVING COUNT(*) >= 8
  )
  SELECT
    p.id,
    p.full_name,
    p.rut_code,
    rf.fc,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (rf.first_fail + interval '10 minutes' - now())) / 60)::int),
    rf.last_fail
  FROM recent_fails rf
  JOIN public.profiles p ON p.rut_code = rf.rut_code
  WHERE p.venue_id = v_venue_id OR p.venue_id IS NULL;
END;
$$;
