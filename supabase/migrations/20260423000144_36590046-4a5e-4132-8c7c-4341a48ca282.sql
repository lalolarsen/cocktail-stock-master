-- =========================================================
-- Fix: Passline broken UNION RLS (cross-venue data leak)
-- =========================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='passline_audit_sessions' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.passline_audit_sessions', p.policyname);
  END LOOP;
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='passline_audit_items' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.passline_audit_items', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "passline_sessions_select_same_venue"
ON public.passline_audit_sessions FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_items_select_same_venue"
ON public.passline_audit_items FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

-- =========================================================
-- Fix: Cash tables - replace auth.uid() IS NOT NULL SELECT
-- =========================================================
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['jornada_cash_openings','jornada_cash_closings','jornada_cash_settings','jornada_cash_pos_defaults']
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY "jco_select_same_venue"
ON public.jornada_cash_openings FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "jcc_select_same_venue"
ON public.jornada_cash_closings FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "jcs_select_same_venue"
ON public.jornada_cash_settings FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "jcpd_select_same_venue"
ON public.jornada_cash_pos_defaults FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

-- =========================================================
-- Fix: waste_requests and replenishment_requests SELECT true
-- =========================================================
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['waste_requests','replenishment_requests']
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY "waste_requests_select_same_venue"
ON public.waste_requests FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "replenishment_requests_select_same_venue"
ON public.replenishment_requests FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

-- =========================================================
-- Fix: ticket_type_cover_options SELECT true
-- =========================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='ticket_type_cover_options' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ticket_type_cover_options', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "ttco_select_same_venue"
ON public.ticket_type_cover_options FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ticket_types tt
    WHERE tt.id = ticket_type_cover_options.ticket_type_id
      AND tt.venue_id = public.get_user_venue_id()
  )
);
