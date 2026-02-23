-- ╔══════════════════════════════════════════════════════════════╗
-- ║  STOCKIA / DiStock — POLICIES                             ║
-- ║  Generated: 2026-02-23                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE POLICY "Admins can delete audit logs" ON public.admin_audit_logs AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert admin audit logs for their venue" ON public.admin_audit_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can manage audit logs" ON public.admin_audit_logs AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view admin audit logs for their venue" ON public.admin_audit_logs AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can view audit events" ON public.app_audit_events AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can view audit events" ON public.app_audit_events AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Service can insert audit events" ON public.app_audit_events AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can view error logs" ON public.app_error_logs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert error logs" ON public.app_error_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Gerencia can view error logs" ON public.app_error_logs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Admins can manage cash registers" ON public.cash_registers AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage cash registers for their venue" ON public.cash_registers AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Everyone can view cash registers" ON public.cash_registers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Gerencia can view cash registers" ON public.cash_registers AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Users can view cash registers for their venue" ON public.cash_registers AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can delete cocktail_addons from their venue" ON public.cocktail_addons AS PERMISSIVE FOR DELETE TO public USING ((addon_id IN ( SELECT product_addons.id
   FROM product_addons
  WHERE (product_addons.venue_id IN ( SELECT profiles.venue_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Users can insert cocktail_addons for their venue" ON public.cocktail_addons AS PERMISSIVE FOR INSERT TO public WITH CHECK ((addon_id IN ( SELECT product_addons.id
   FROM product_addons
  WHERE (product_addons.venue_id IN ( SELECT profiles.venue_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Users can view cocktail_addons from their venue" ON public.cocktail_addons AS PERMISSIVE FOR SELECT TO public USING ((addon_id IN ( SELECT product_addons.id
   FROM product_addons
  WHERE (product_addons.venue_id IN ( SELECT profiles.venue_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Admins can manage ingredients for their venue" ON public.cocktail_ingredients AS PERMISSIVE FOR ALL TO public USING ((has_role(auth.uid(), 'admin'::app_role) AND (venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
CREATE POLICY "Users can view ingredients for their venue" ON public.cocktail_ingredients AS PERMISSIVE FOR SELECT TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins can manage cocktails for their venue" ON public.cocktails AS PERMISSIVE FOR ALL TO public USING ((has_role(auth.uid(), 'admin'::app_role) AND (venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
CREATE POLICY "Users can view cocktails for their venue" ON public.cocktails AS PERMISSIVE FOR SELECT TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admin can manage courtesy_qr" ON public.courtesy_qr AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Gerencia can manage courtesy_qr" ON public.courtesy_qr AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Vendedores can update courtesy_qr on redeem" ON public.courtesy_qr AS PERMISSIVE FOR UPDATE TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role)));
CREATE POLICY "Vendedores can view courtesy_qr" ON public.courtesy_qr AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role)));
CREATE POLICY "Admin can manage courtesy_redemptions" ON public.courtesy_redemptions AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Gerencia can view courtesy_redemptions" ON public.courtesy_redemptions AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Vendedores can insert courtesy_redemptions" ON public.courtesy_redemptions AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role)));
CREATE POLICY "Vendedores can view courtesy_redemptions" ON public.courtesy_redemptions AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role)));
CREATE POLICY "Demo venue members can manage demo logs" ON public.demo_event_logs AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.venue_id = demo_event_logs.venue_id)))));
CREATE POLICY "Developers can insert feature flags" ON public.developer_feature_flags AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Developers can read feature flags" ON public.developer_feature_flags AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Developers can update feature flags" ON public.developer_feature_flags AS PERMISSIVE FOR UPDATE TO public USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Developers can insert flag audit" ON public.developer_flag_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Developers can read flag audit" ON public.developer_flag_audit AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Developers can read reset audit" ON public.developer_reset_audit AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "System can insert reset audit" ON public.developer_reset_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admin can manage expense_lines" ON public.expense_lines AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM purchases p
  WHERE ((p.id = expense_lines.purchase_id) AND (p.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchases p
  WHERE ((p.id = expense_lines.purchase_id) AND (p.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)))));
CREATE POLICY "Developer can manage expense_lines" ON public.expense_lines AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Admins can manage expenses for their venue" ON public.expenses AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view expenses for their venue" ON public.expenses AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage feature flags" ON public.feature_flags AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM worker_roles wr
  WHERE ((wr.worker_id = auth.uid()) AND (wr.role = 'admin'::app_role) AND (wr.venue_id = feature_flags.venue_id)))));
CREATE POLICY "Developers can manage all feature flags" ON public.feature_flags AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Workers can read feature flags for their venue" ON public.feature_flags AS PERMISSIVE FOR SELECT TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Developers can read feature flags master" ON public.feature_flags_master AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Admins can manage gross income entries" ON public.gross_income_entries AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can create manual income entries" ON public.gross_income_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_role(auth.uid(), 'gerencia'::app_role) AND (source_type = 'manual'::text)));
CREATE POLICY "Gerencia can view gross income entries" ON public.gross_income_entries AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Sellers can create sale income entries" ON public.gross_income_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_role(auth.uid(), 'vendedor'::app_role) AND (source_type = 'sale'::text) AND (created_by = auth.uid())));
CREATE POLICY "Ticket sellers can create ticket income entries" ON public.gross_income_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_role(auth.uid(), 'ticket_seller'::app_role) AND (source_type = 'ticket'::text) AND (created_by = auth.uid())));
CREATE POLICY "Admins can manage invoicing config for their venue" ON public.invoicing_config AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view invoicing config for their venue" ON public.invoicing_config AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can read jornada audit logs" ON public.jornada_audit_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'gerencia'::app_role]))))));
CREATE POLICY "System can insert jornada audit logs" ON public.jornada_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can manage cash closings" ON public.jornada_cash_closings AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view cash closings" ON public.jornada_cash_closings AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Gerencia can view cash closings" ON public.jornada_cash_closings AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Admins can manage cash openings" ON public.jornada_cash_openings AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view cash openings" ON public.jornada_cash_openings AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Admins can manage pos defaults" ON public.jornada_cash_pos_defaults AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view pos defaults" ON public.jornada_cash_pos_defaults AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Admins can manage cash settings" ON public.jornada_cash_settings AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view cash settings" ON public.jornada_cash_settings AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Admins can manage jornada config for their venue" ON public.jornada_config AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view jornada config for their venue" ON public.jornada_config AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can insert summaries for their venue" ON public.jornada_financial_summary AS PERMISSIVE FOR INSERT TO public WITH CHECK ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can read summaries for their venue" ON public.jornada_financial_summary AS PERMISSIVE FOR SELECT TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins can manage jornadas for their venue" ON public.jornadas AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view jornadas for their venue" ON public.jornadas AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admin can manage learning_product_mappings" ON public.learning_product_mappings AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Developer can manage learning_product_mappings" ON public.learning_product_mappings AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Admins can view login attempts" ON public.login_attempts AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert login attempts" ON public.login_attempts AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can delete login history" ON public.login_history AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert login history" ON public.login_history AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can view login history for their venue" ON public.login_history AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can delete notification logs" ON public.notification_logs AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view notification logs" ON public.notification_logs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Allow insert for service role and enqueue function" ON public.notification_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow status updates" ON public.notification_logs AS PERMISSIVE FOR UPDATE TO public USING ((has_role(auth.uid(), 'admin'::app_role) OR (status = 'queued'::text)));
CREATE POLICY "Gerencia can view notification logs" ON public.notification_logs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Admins can delete notification preferences" ON public.notification_preferences AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage notification preferences" ON public.notification_preferences AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can update own preferences" ON public.notification_preferences AS PERMISSIVE FOR UPDATE TO public USING (((worker_id = auth.uid()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Gerencia can view own preferences" ON public.notification_preferences AS PERMISSIVE FOR SELECT TO public USING (((worker_id = auth.uid()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "open_bottle_events_insert" ON public.open_bottle_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "open_bottle_events_select" ON public.open_bottle_events AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "open_bottles_insert" ON public.open_bottles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "open_bottles_select" ON public.open_bottles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "open_bottles_update" ON public.open_bottles AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage operational expenses" ON public.operational_expenses AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Gerencia can insert operational expenses" ON public.operational_expenses AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Gerencia can view operational expenses" ON public.operational_expenses AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "System can insert redemption logs" ON public.pickup_redemptions_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can view redemption logs for their venue" ON public.pickup_redemptions_log AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage pickup tokens for their venue" ON public.pickup_tokens AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Sellers can create tokens for their venue" ON public.pickup_tokens AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND (has_role(auth.uid(), 'vendedor'::app_role) OR has_role(auth.uid(), 'ticket_seller'::app_role))));
CREATE POLICY "Users can view pickup tokens for their venue" ON public.pickup_tokens AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage POS terminals for their venue" ON public.pos_terminals AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view POS terminals for their venue" ON public.pos_terminals AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can delete addons from their venue" ON public.product_addons AS PERMISSIVE FOR DELETE TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can insert addons for their venue" ON public.product_addons AS PERMISSIVE FOR INSERT TO public WITH CHECK ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update addons from their venue" ON public.product_addons AS PERMISSIVE FOR UPDATE TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view addons from their venue" ON public.product_addons AS PERMISSIVE FOR SELECT TO public USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admin can manage product mappings" ON public.product_name_mappings AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM worker_roles
  WHERE ((worker_roles.worker_id = auth.uid()) AND (worker_roles.role = 'admin'::app_role)))));
CREATE POLICY "Authenticated venue users can manage products" ON public.products AS PERMISSIVE FOR ALL TO authenticated USING ((venue_id = get_user_venue_id())) WITH CHECK ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can view products for their venue" ON public.products AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can delete profiles" ON public.profiles AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Users can view their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Admin can manage provider mappings" ON public.provider_product_mappings AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "Users can delete mappings for their venue" ON public.provider_product_mappings AS PERMISSIVE FOR DELETE TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can insert mappings for their venue" ON public.provider_product_mappings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can update mappings for their venue" ON public.provider_product_mappings AS PERMISSIVE FOR UPDATE TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can view mappings for their venue" ON public.provider_product_mappings AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admin can create purchase documents" ON public.purchase_documents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM worker_roles
  WHERE ((worker_roles.worker_id = auth.uid()) AND (worker_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admin can update purchase documents" ON public.purchase_documents AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM worker_roles
  WHERE ((worker_roles.worker_id = auth.uid()) AND (worker_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admin can view purchase documents" ON public.purchase_documents AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM worker_roles
  WHERE ((worker_roles.worker_id = auth.uid()) AND (worker_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admins can insert audit logs" ON public.purchase_import_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Users can view audit for their venue docs" ON public.purchase_import_audit AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM purchase_documents pd
  WHERE ((pd.id = purchase_import_audit.purchase_document_id) AND (pd.venue_id = get_user_venue_id())))));
CREATE POLICY "Users can create drafts" ON public.purchase_import_drafts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own drafts" ON public.purchase_import_drafts AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own drafts" ON public.purchase_import_drafts AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own drafts" ON public.purchase_import_drafts AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admin can manage purchase_import_lines" ON public.purchase_import_lines AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM purchase_imports pi
  WHERE ((pi.id = purchase_import_lines.purchase_import_id) AND (pi.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_imports pi
  WHERE ((pi.id = purchase_import_lines.purchase_import_id) AND (pi.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)))));
CREATE POLICY "Developer can manage purchase_import_lines" ON public.purchase_import_lines AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Gerencia can view purchase_import_lines" ON public.purchase_import_lines AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM purchase_imports pi
  WHERE ((pi.id = purchase_import_lines.purchase_import_id) AND (pi.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)))));
CREATE POLICY "Admin can manage purchase_import_taxes" ON public.purchase_import_taxes AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM purchase_imports pi
  WHERE ((pi.id = purchase_import_taxes.purchase_import_id) AND (pi.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_imports pi
  WHERE ((pi.id = purchase_import_taxes.purchase_import_id) AND (pi.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)))));
CREATE POLICY "Developer can manage purchase_import_taxes" ON public.purchase_import_taxes AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Admin can manage purchase_imports for venue" ON public.purchase_imports AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Developer can manage purchase_imports" ON public.purchase_imports AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Gerencia can view purchase_imports for venue" ON public.purchase_imports AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Admin can manage purchase items" ON public.purchase_items AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM worker_roles
  WHERE ((worker_roles.worker_id = auth.uid()) AND (worker_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admin can manage purchase_lines" ON public.purchase_lines AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM purchases p
  WHERE ((p.id = purchase_lines.purchase_id) AND (p.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchases p
  WHERE ((p.id = purchase_lines.purchase_id) AND (p.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)))));
CREATE POLICY "Developer can manage purchase_lines" ON public.purchase_lines AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Gerencia can view purchase_lines" ON public.purchase_lines AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM purchases p
  WHERE ((p.id = purchase_lines.purchase_id) AND (p.venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)))));
CREATE POLICY "Admin can manage purchases for venue" ON public.purchases AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Developer can manage purchases" ON public.purchases AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Gerencia can view purchases for venue" ON public.purchases AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Admins can manage replenishment plan items" ON public.replenishment_plan_items AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage replenishment plan items for their venue" ON public.replenishment_plan_items AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Gerencia can view replenishment plan items" ON public.replenishment_plan_items AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Users can view replenishment plan items for their venue" ON public.replenishment_plan_items AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage replenishment plans for their venue" ON public.replenishment_plans AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view replenishment plans for their venue" ON public.replenishment_plans AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Developers can read resettable_tables" ON public.resettable_tables AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Users can insert sale_item_addons for their venue" ON public.sale_item_addons AS PERMISSIVE FOR INSERT TO public WITH CHECK ((sale_item_id IN ( SELECT si.id
   FROM (sale_items si
     JOIN sales s ON ((s.id = si.sale_id)))
  WHERE (s.venue_id IN ( SELECT profiles.venue_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Users can view sale_item_addons from their venue" ON public.sale_item_addons AS PERMISSIVE FOR SELECT TO public USING ((sale_item_id IN ( SELECT si.id
   FROM (sale_items si
     JOIN sales s ON ((s.id = si.sale_id)))
  WHERE (s.venue_id IN ( SELECT profiles.venue_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Admins can manage sale items for their venue" ON public.sale_items AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Sellers can create sale items for their venue" ON public.sale_items AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role)));
CREATE POLICY "Users can view sale items for their venue" ON public.sale_items AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage sales for their venue" ON public.sales AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Sellers can create sales for their venue" ON public.sales AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'vendedor'::app_role)));
CREATE POLICY "Sellers can update their own sales" ON public.sales AS PERMISSIVE FOR UPDATE TO public USING (((venue_id = get_user_venue_id()) AND (seller_id = auth.uid())));
CREATE POLICY "Users can view sales for their venue" ON public.sales AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage sales documents for their venue" ON public.sales_documents AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can update sales documents" ON public.sales_documents AS PERMISSIVE FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all sales documents" ON public.sales_documents AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can insert for own sales" ON public.sales_documents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM sales
  WHERE ((sales.id = sales_documents.sale_id) AND (sales.seller_id = auth.uid())))));
CREATE POLICY "Gerencia can update sales documents" ON public.sales_documents AS PERMISSIVE FOR UPDATE TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Gerencia can view all sales documents" ON public.sales_documents AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Sellers can view own sales documents" ON public.sales_documents AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM sales
  WHERE ((sales.id = sales_documents.sale_id) AND (sales.seller_id = auth.uid())))));
CREATE POLICY "Users can view sales documents for their venue" ON public.sales_documents AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Developers can manage sidebar config" ON public.sidebar_config AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'developer'::app_role)))));
CREATE POLICY "Users can read their venue sidebar config" ON public.sidebar_config AS PERMISSIVE FOR SELECT TO authenticated USING ((venue_id IN ( SELECT profiles.venue_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins can manage tax categories" ON public.specific_tax_categories AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view tax categories for their venue" ON public.specific_tax_categories AS PERMISSIVE FOR SELECT TO public USING (((venue_id = get_user_venue_id()) OR (venue_id IS NULL)));
CREATE POLICY "Admins can manage stock alerts for their venue" ON public.stock_alerts AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock alerts for their venue" ON public.stock_alerts AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock balances for their venue" ON public.stock_balances AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock balances for their venue" ON public.stock_balances AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage intake batches" ON public.stock_intake_batches AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view intake batches for their venue" ON public.stock_intake_batches AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage intake items" ON public.stock_intake_items AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view intake items for their venue" ON public.stock_intake_items AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage minimums for their venue" ON public.stock_location_minimums AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Gerencia can manage minimums for their venue" ON public.stock_location_minimums AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Users can view minimums for their venue" ON public.stock_location_minimums AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock locations for their venue" ON public.stock_locations AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock locations for their venue" ON public.stock_locations AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock lots" ON public.stock_lots AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can view stock lots" ON public.stock_lots AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Users can view stock lots for their venue" ON public.stock_lots AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock movements for their venue" ON public.stock_movements AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock movements for their venue" ON public.stock_movements AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock predictions for their venue" ON public.stock_predictions AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock predictions for their venue" ON public.stock_predictions AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock transfer items for their venue" ON public.stock_transfer_items AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock transfer items for their venue" ON public.stock_transfer_items AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage stock transfers for their venue" ON public.stock_transfers AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view stock transfers for their venue" ON public.stock_transfers AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can delete aliases for their venue" ON public.supplier_product_aliases AS PERMISSIVE FOR DELETE TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can insert aliases for their venue" ON public.supplier_product_aliases AS PERMISSIVE FOR INSERT TO public WITH CHECK ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can update aliases for their venue" ON public.supplier_product_aliases AS PERMISSIVE FOR UPDATE TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Users can view aliases for their venue" ON public.supplier_product_aliases AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage ticket sale items for their venue" ON public.ticket_sale_items AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Ticket sellers can create ticket sale items for their venue" ON public.ticket_sale_items AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'ticket_seller'::app_role)));
CREATE POLICY "Users can view ticket sale items for their venue" ON public.ticket_sale_items AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage ticket sales for their venue" ON public.ticket_sales AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Ticket sellers can create ticket sales for their venue" ON public.ticket_sales AS PERMISSIVE FOR INSERT TO public WITH CHECK (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'ticket_seller'::app_role)));
CREATE POLICY "Users can view ticket sales for their venue" ON public.ticket_sales AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can manage ticket types for their venue" ON public.ticket_types AS PERMISSIVE FOR ALL TO public USING (((venue_id = get_user_venue_id()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Gerencia can view ticket types" ON public.ticket_types AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Ticket sellers can view active ticket types" ON public.ticket_types AS PERMISSIVE FOR SELECT TO public USING ((has_role(auth.uid(), 'ticket_seller'::app_role) AND (is_active = true)));
CREATE POLICY "Users can view ticket types for their venue" ON public.ticket_types AS PERMISSIVE FOR SELECT TO public USING ((venue_id = get_user_venue_id()));
CREATE POLICY "Admins can delete user roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Users can view their own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "uvr_select_own_rows" ON public.user_venue_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Developers can manage venue feature flags" ON public.venue_feature_flags AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'developer'::app_role)) WITH CHECK (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Admins can manage venues" ON public.venues AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Developers can read all venues" ON public.venues AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'developer'::app_role));
CREATE POLICY "Users can view their own venue" ON public.venues AS PERMISSIVE FOR SELECT TO public USING ((id = get_user_venue_id()));
CREATE POLICY "Admins and gerencia can update waste requests" ON public.waste_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerencia'::app_role)));
CREATE POLICY "Authenticated users can create waste requests" ON public.waste_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = requested_by_user_id));
CREATE POLICY "Authenticated users can view waste requests" ON public.waste_requests AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can delete worker roles" ON public.worker_roles AS PERMISSIVE FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage worker roles" ON public.worker_roles AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Gerencia can view worker roles" ON public.worker_roles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'gerencia'::app_role));
CREATE POLICY "Users can view their own worker roles" ON public.worker_roles AS PERMISSIVE FOR SELECT TO public USING ((worker_id = auth.uid()));
