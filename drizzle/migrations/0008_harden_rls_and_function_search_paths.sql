ALTER FUNCTION public.end_worker_session(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.validate_bar_pin(text,uuid,uuid) SET search_path = public, extensions;
ALTER FUNCTION public.dev_get_all_tables() SET search_path = public, extensions;
ALTER FUNCTION public.is_product_sellable(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.set_worker_pin(uuid,text) SET search_path = public, extensions;
ALTER FUNCTION public.start_worker_session(uuid,uuid,uuid,text) SET search_path = public, extensions;

DROP POLICY IF EXISTS authenticated_insert_app_audit_events ON public.app_audit_events;
CREATE POLICY authenticated_insert_app_audit_events ON public.app_audit_events FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS authenticated_insert_app_error_logs ON public.app_error_logs;
CREATE POLICY authenticated_insert_app_error_logs ON public.app_error_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS authenticated_insert_jornada_audit_log ON public.jornada_audit_log;
CREATE POLICY authenticated_insert_jornada_audit_log ON public.jornada_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id IS NULL OR actor_user_id = auth.uid());

DROP POLICY IF EXISTS authenticated_insert_pickup_redemptions_log ON public.pickup_redemptions_log;
CREATE POLICY authenticated_insert_pickup_redemptions_log ON public.pickup_redemptions_log FOR INSERT TO authenticated
  WITH CHECK (venue_id IS NULL OR venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;

DROP POLICY IF EXISTS "System can insert login history" ON public.login_history;
CREATE POLICY "Users insert own login history" ON public.login_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS coatcheck_settings_select ON public.coatcheck_settings;
CREATE POLICY coatcheck_settings_select ON public.coatcheck_settings FOR SELECT TO authenticated
  USING (venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS coatcheck_tickets_select ON public.coatcheck_tickets;
CREATE POLICY coatcheck_tickets_select ON public.coatcheck_tickets FOR SELECT TO authenticated
  USING (venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS coatcheck_tickets_update ON public.coatcheck_tickets;
CREATE POLICY coatcheck_tickets_update ON public.coatcheck_tickets FOR UPDATE TO authenticated
  USING (venue_id = public.get_user_venue_id())
  WITH CHECK (venue_id = public.get_user_venue_id());