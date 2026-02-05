-- ============================================
-- DiStock Database Schema Export
-- Part 14: Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_flag_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sidebar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resettable_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_reset_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replenishment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replenishment_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cocktails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cocktail_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cocktail_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_redemptions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_cash_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_cash_pos_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_cash_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gross_income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_financial_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_import_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_import_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_name_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoicing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_event_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VENUES POLICIES
-- ============================================

CREATE POLICY "Users can view their own venue"
  ON public.venues FOR SELECT
  USING (id IN (SELECT venue_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- PROFILES POLICIES
-- ============================================

CREATE POLICY "Users can view profiles in their venue"
  ON public.profiles FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- PRODUCTS POLICIES
-- ============================================

CREATE POLICY "Users can view products for their venue"
  ON public.products FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage products for their venue"
  ON public.products FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- STOCK LOCATIONS POLICIES
-- ============================================

CREATE POLICY "Users can view stock locations for their venue"
  ON public.stock_locations FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock locations for their venue"
  ON public.stock_locations FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- JORNADAS POLICIES
-- ============================================

CREATE POLICY "Users can view jornadas for their venue"
  ON public.jornadas FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage jornadas for their venue"
  ON public.jornadas FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- SALES POLICIES
-- ============================================

CREATE POLICY "Users can view sales for their venue"
  ON public.sales FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Sellers can create sales for their venue"
  ON public.sales FOR INSERT
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Admins can manage sales for their venue"
  ON public.sales FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- PICKUP TOKENS POLICIES
-- ============================================

CREATE POLICY "Users can view pickup tokens for their venue"
  ON public.pickup_tokens FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Sellers can create tokens for their venue"
  ON public.pickup_tokens FOR INSERT
  WITH CHECK (venue_id = get_user_venue_id() AND (has_role(auth.uid(), 'vendedor') OR has_role(auth.uid(), 'ticket_seller')));

CREATE POLICY "Admins can manage pickup tokens for their venue"
  ON public.pickup_tokens FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- COCKTAILS POLICIES
-- ============================================

CREATE POLICY "Users can view cocktails for their venue"
  ON public.cocktails FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage cocktails for their venue"
  ON public.cocktails FOR ALL
  USING (has_role(auth.uid(), 'admin') AND venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- POS TERMINALS POLICIES
-- ============================================

CREATE POLICY "Users can view POS terminals for their venue"
  ON public.pos_terminals FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage POS terminals for their venue"
  ON public.pos_terminals FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- EXPENSES POLICIES
-- ============================================

CREATE POLICY "Users can view expenses for their venue"
  ON public.expenses FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage expenses for their venue"
  ON public.expenses FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- ============================================
-- FEATURE FLAGS POLICIES
-- ============================================

CREATE POLICY "Workers can read feature flags for their venue"
  ON public.feature_flags FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM worker_roles wr
    WHERE wr.worker_id = auth.uid() AND wr.role = 'admin' AND wr.venue_id = feature_flags.venue_id
  ));

CREATE POLICY "Developers can manage all feature flags"
  ON public.feature_flags FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'developer'))
  WITH CHECK (has_role(auth.uid(), 'developer'));

-- ============================================
-- DEVELOPER FEATURE FLAGS POLICIES
-- ============================================

CREATE POLICY "Developers can read feature flags"
  ON public.developer_feature_flags FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

CREATE POLICY "Developers can insert feature flags"
  ON public.developer_feature_flags FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'developer'));

CREATE POLICY "Developers can update feature flags"
  ON public.developer_feature_flags FOR UPDATE
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- AUDIT LOGS POLICIES
-- ============================================

CREATE POLICY "Admins can view audit events"
  ON public.app_audit_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view audit events"
  ON public.app_audit_events FOR SELECT
  USING (has_role(auth.uid(), 'gerencia'));

CREATE POLICY "Service can insert audit events"
  ON public.app_audit_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can insert error logs"
  ON public.app_error_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view error logs"
  ON public.app_error_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- DEMO EVENT LOGS POLICIES
-- ============================================

CREATE POLICY "Demo venue members can manage demo logs"
  ON public.demo_event_logs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.venue_id = demo_event_logs.venue_id
  ));
