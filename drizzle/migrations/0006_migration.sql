ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS ref_key text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS jornada_id uuid,
  ADD COLUMN IF NOT EXISTS user_name text;

CREATE INDEX IF NOT EXISTS idx_print_jobs_source_ref ON public.print_jobs (source, ref_key);
CREATE INDEX IF NOT EXISTS idx_print_jobs_jornada ON public.print_jobs (jornada_id);

CREATE OR REPLACE FUNCTION public.register_reprint(
  _venue_id uuid, _source text, _ref_key text, _jornada_id uuid, _pos_id uuid, _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _count int;
  _name text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM worker_roles WHERE worker_id = _uid AND venue_id = _venue_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  SELECT count(*) INTO _count FROM print_jobs
   WHERE source = _source AND ref_key = _ref_key AND kind = 'reprint';
  IF _count >= 1 AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gerencia')) THEN
    RAISE EXCEPTION 'REPRINT_LIMIT';
  END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = _uid;
  INSERT INTO print_jobs (venue_id, pos_id, user_id, user_name, job_type, print_status, printer_name, payload, attempts, source, ref_key, kind, jornada_id, printed_at)
  VALUES (_venue_id, _pos_id, _uid, _name, _source, 'sent', 'rawbt', COALESCE(_payload, '{}'::jsonb), 1, _source, _ref_key, 'reprint', _jornada_id, now())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.register_reprint(uuid,text,text,uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_reprint(uuid,text,text,uuid,uuid,jsonb) TO authenticated;