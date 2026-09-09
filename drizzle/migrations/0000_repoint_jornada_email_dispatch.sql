DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'dispatch_jornada_closed_email'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'dispatch_jornada_closed_email not found; nothing to repoint';
    RETURN;
  END IF;

  v_src := replace(
    v_src,
    '/functions/v1/send-transactional-email',
    '/functions/v1/send-jornada-summary'
  );

  EXECUTE v_src;
END
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_jornada_closed_email(uuid) TO authenticated, service_role;