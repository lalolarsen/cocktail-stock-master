-- =========================================================
-- 1) Audit/log tables: restrict INSERT to authenticated only
-- =========================================================
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_error_logs',
    'app_audit_events',
    'jornada_audit_log',
    'pickup_redemptions_log',
    'developer_reset_audit'
  ]
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='INSERT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY "authenticated_insert_app_error_logs"
ON public.app_error_logs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_insert_app_audit_events"
ON public.app_audit_events FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_insert_jornada_audit_log"
ON public.jornada_audit_log FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_insert_pickup_redemptions_log"
ON public.pickup_redemptions_log FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_insert_developer_reset_audit"
ON public.developer_reset_audit FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'developer'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 2) Passline tables: drop broken UNION policies, scope to venue
-- =========================================================
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['passline_audit_sessions','passline_audit_items']
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY "passline_sessions_select_same_venue"
ON public.passline_audit_sessions FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_sessions_insert_same_venue"
ON public.passline_audit_sessions FOR INSERT TO authenticated
WITH CHECK (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_sessions_update_same_venue"
ON public.passline_audit_sessions FOR UPDATE TO authenticated
USING (venue_id = public.get_user_venue_id())
WITH CHECK (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_sessions_delete_admin_same_venue"
ON public.passline_audit_sessions FOR DELETE TO authenticated
USING (
  venue_id = public.get_user_venue_id()
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role))
);

CREATE POLICY "passline_items_select_same_venue"
ON public.passline_audit_items FOR SELECT TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_items_insert_same_venue"
ON public.passline_audit_items FOR INSERT TO authenticated
WITH CHECK (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_items_update_same_venue"
ON public.passline_audit_items FOR UPDATE TO authenticated
USING (venue_id = public.get_user_venue_id())
WITH CHECK (venue_id = public.get_user_venue_id());

CREATE POLICY "passline_items_delete_admin_same_venue"
ON public.passline_audit_items FOR DELETE TO authenticated
USING (
  venue_id = public.get_user_venue_id()
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role))
);

-- =========================================================
-- 3) Profiles: scope admin access to same venue
-- =========================================================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can view profiles in their venue"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND venue_id = public.get_user_venue_id()
);

CREATE POLICY "Admins can update profiles in their venue"
ON public.profiles FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND venue_id = public.get_user_venue_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND venue_id = public.get_user_venue_id()
);

-- =========================================================
-- 4) notification_logs: restrict UPDATE to admins (authenticated)
-- =========================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_logs' AND cmd='UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notification_logs', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "notification_logs_admin_update"
ON public.notification_logs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (venue_id IS NULL OR venue_id = public.get_user_venue_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (venue_id IS NULL OR venue_id = public.get_user_venue_id())
);
