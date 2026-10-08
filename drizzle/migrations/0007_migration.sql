DROP POLICY IF EXISTS "Workers can insert print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Workers can view print jobs in their venue" ON public.print_jobs;
CREATE POLICY "Workers can insert print jobs" ON public.print_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND venue_id = (SELECT p.venue_id FROM public.profiles p WHERE p.id = auth.uid()));
CREATE POLICY "Workers can view print jobs in their venue" ON public.print_jobs FOR SELECT TO authenticated
  USING (venue_id = (SELECT p.venue_id FROM public.profiles p WHERE p.id = auth.uid()));

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
  SELECT full_name INTO _name FROM profiles WHERE id = _uid AND venue_id = _venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_source || ':' || _ref_key));
  SELECT count(*) INTO _count FROM print_jobs
   WHERE source = _source AND ref_key = _ref_key AND kind = 'reprint';
  IF _count >= 1 AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gerencia')) THEN
    RAISE EXCEPTION 'REPRINT_LIMIT';
  END IF;
  INSERT INTO print_jobs (venue_id, pos_id, user_id, user_name, job_type, print_status, printer_name, payload, attempts, source, ref_key, kind, jornada_id, printed_at)
  VALUES (_venue_id, _pos_id, _uid, _name, _source, 'sent', 'rawbt', COALESCE(_payload, '{}'::jsonb), 1, _source, _ref_key, 'reprint', _jornada_id, now())
  RETURNING id INTO _id;
  RETURN _id;
END $$;