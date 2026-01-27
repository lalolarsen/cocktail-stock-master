-- =====================================================
-- MULTI-VENUE ISOLATION: Complete Migration
-- =====================================================

-- Berlin venue ID for backfill
-- 4e128e76-980d-4233-a438-92aa02cfb50b

-- =====================================================
-- 1. stock_locations - Add venue_id
-- =====================================================
-- Already has venue_id per schema

-- =====================================================
-- 2. stock_balances - Add venue_id
-- =====================================================
ALTER TABLE public.stock_balances 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.stock_balances 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.stock_balances 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.stock_balances 
ADD CONSTRAINT stock_balances_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_stock_balances_venue 
ON public.stock_balances(venue_id);

-- =====================================================
-- 3. stock_movements - Add venue_id
-- =====================================================
ALTER TABLE public.stock_movements 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.stock_movements 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.stock_movements 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.stock_movements 
ADD CONSTRAINT stock_movements_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_venue 
ON public.stock_movements(venue_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_venue_created 
ON public.stock_movements(venue_id, created_at);

-- =====================================================
-- 4. stock_transfers - Add venue_id
-- =====================================================
ALTER TABLE public.stock_transfers 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.stock_transfers 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.stock_transfers 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.stock_transfers 
ADD CONSTRAINT stock_transfers_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_venue 
ON public.stock_transfers(venue_id);

-- =====================================================
-- 5. stock_transfer_items - Add venue_id
-- =====================================================
ALTER TABLE public.stock_transfer_items 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.stock_transfer_items sti
SET venue_id = st.venue_id
FROM public.stock_transfers st
WHERE sti.transfer_id = st.id AND sti.venue_id IS NULL;

-- For any orphans, set to Berlin
UPDATE public.stock_transfer_items 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.stock_transfer_items 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.stock_transfer_items 
ADD CONSTRAINT stock_transfer_items_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_venue 
ON public.stock_transfer_items(venue_id);

-- =====================================================
-- 6. stock_alerts - Add venue_id
-- =====================================================
ALTER TABLE public.stock_alerts 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.stock_alerts 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.stock_alerts 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.stock_alerts 
ADD CONSTRAINT stock_alerts_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_venue 
ON public.stock_alerts(venue_id);

-- =====================================================
-- 7. stock_predictions - Add venue_id
-- =====================================================
ALTER TABLE public.stock_predictions 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.stock_predictions 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.stock_predictions 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.stock_predictions 
ADD CONSTRAINT stock_predictions_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_stock_predictions_venue 
ON public.stock_predictions(venue_id);

-- =====================================================
-- 8. sale_items - Add venue_id
-- =====================================================
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.sale_items si
SET venue_id = s.venue_id
FROM public.sales s
WHERE si.sale_id = s.id AND si.venue_id IS NULL;

-- For any orphans
UPDATE public.sale_items 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.sale_items 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.sale_items 
ADD CONSTRAINT sale_items_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_sale_items_venue 
ON public.sale_items(venue_id);

-- =====================================================
-- 9. ticket_sale_items - Add venue_id
-- =====================================================
ALTER TABLE public.ticket_sale_items 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.ticket_sale_items tsi
SET venue_id = ts.venue_id
FROM public.ticket_sales ts
WHERE tsi.ticket_sale_id = ts.id AND tsi.venue_id IS NULL;

-- For any orphans
UPDATE public.ticket_sale_items 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.ticket_sale_items 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.ticket_sale_items 
ADD CONSTRAINT ticket_sale_items_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_ticket_sale_items_venue 
ON public.ticket_sale_items(venue_id);

-- =====================================================
-- 10. pickup_redemptions_log - Add venue_id
-- =====================================================
ALTER TABLE public.pickup_redemptions_log 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.pickup_redemptions_log prl
SET venue_id = pt.venue_id
FROM public.pickup_tokens pt
WHERE prl.pickup_token_id = pt.id AND prl.venue_id IS NULL;

-- For any orphans
UPDATE public.pickup_redemptions_log 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.pickup_redemptions_log 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.pickup_redemptions_log 
ADD CONSTRAINT pickup_redemptions_log_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_venue 
ON public.pickup_redemptions_log(venue_id);

CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_venue_created 
ON public.pickup_redemptions_log(venue_id, created_at);

-- =====================================================
-- 11. replenishment_plans - Add venue_id
-- =====================================================
ALTER TABLE public.replenishment_plans 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.replenishment_plans 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.replenishment_plans 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.replenishment_plans 
ADD CONSTRAINT replenishment_plans_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_replenishment_plans_venue 
ON public.replenishment_plans(venue_id);

-- =====================================================
-- 12. replenishment_plan_items - Add venue_id
-- =====================================================
ALTER TABLE public.replenishment_plan_items 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.replenishment_plan_items rpi
SET venue_id = rp.venue_id
FROM public.replenishment_plans rp
WHERE rpi.replenishment_plan_id = rp.id AND rpi.venue_id IS NULL;

-- For any orphans
UPDATE public.replenishment_plan_items 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.replenishment_plan_items 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.replenishment_plan_items 
ADD CONSTRAINT replenishment_plan_items_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_replenishment_plan_items_venue 
ON public.replenishment_plan_items(venue_id);

-- =====================================================
-- 13. cash_registers - Add venue_id
-- =====================================================
ALTER TABLE public.cash_registers 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.cash_registers cr
SET venue_id = j.venue_id
FROM public.jornadas j
WHERE cr.jornada_id = j.id AND cr.venue_id IS NULL;

-- For any orphans
UPDATE public.cash_registers 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.cash_registers 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.cash_registers 
ADD CONSTRAINT cash_registers_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_cash_registers_venue 
ON public.cash_registers(venue_id);

-- =====================================================
-- 14. login_history - Add venue_id
-- =====================================================
ALTER TABLE public.login_history 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.login_history lh
SET venue_id = p.venue_id
FROM public.profiles p
WHERE lh.user_id = p.id AND lh.venue_id IS NULL;

-- For any orphans
UPDATE public.login_history 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.login_history 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.login_history 
ADD CONSTRAINT login_history_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_login_history_venue 
ON public.login_history(venue_id);

-- =====================================================
-- 15. admin_audit_logs - Add venue_id
-- =====================================================
ALTER TABLE public.admin_audit_logs 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.admin_audit_logs aal
SET venue_id = p.venue_id
FROM public.profiles p
WHERE aal.admin_id = p.id AND aal.venue_id IS NULL;

-- For any orphans
UPDATE public.admin_audit_logs 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.admin_audit_logs 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.admin_audit_logs 
ADD CONSTRAINT admin_audit_logs_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_venue 
ON public.admin_audit_logs(venue_id);

-- =====================================================
-- 16. jornada_config - Add venue_id (make per-venue)
-- =====================================================
ALTER TABLE public.jornada_config 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.jornada_config 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.jornada_config 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.jornada_config 
ADD CONSTRAINT jornada_config_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_jornada_config_venue 
ON public.jornada_config(venue_id);

-- =====================================================
-- 17. invoicing_config - Add venue_id (make per-venue)
-- =====================================================
ALTER TABLE public.invoicing_config 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.invoicing_config 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.invoicing_config 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.invoicing_config 
ADD CONSTRAINT invoicing_config_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_invoicing_config_venue 
ON public.invoicing_config(venue_id);

-- =====================================================
-- 18. sales_documents - Add venue_id
-- =====================================================
ALTER TABLE public.sales_documents 
ADD COLUMN IF NOT EXISTS venue_id uuid;

UPDATE public.sales_documents sd
SET venue_id = s.venue_id
FROM public.sales s
WHERE sd.sale_id = s.id AND sd.venue_id IS NULL;

-- For any orphans
UPDATE public.sales_documents 
SET venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE venue_id IS NULL;

ALTER TABLE public.sales_documents 
ALTER COLUMN venue_id SET NOT NULL;

ALTER TABLE public.sales_documents 
ADD CONSTRAINT sales_documents_venue_id_fkey 
FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE INDEX IF NOT EXISTS idx_sales_documents_venue 
ON public.sales_documents(venue_id);

-- =====================================================
-- RLS POLICIES FOR ALL NEW VENUE-SCOPED TABLES
-- =====================================================

-- Helper function to get user's venue_id (if not exists)
CREATE OR REPLACE FUNCTION public.get_user_venue_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT venue_id FROM public.profiles WHERE id = auth.uid()
$$;

-- stock_balances RLS
DROP POLICY IF EXISTS "Admins can manage stock balances" ON public.stock_balances;
DROP POLICY IF EXISTS "Everyone can view stock balances" ON public.stock_balances;
DROP POLICY IF EXISTS "Gerencia can view stock balances" ON public.stock_balances;

CREATE POLICY "Users can view stock balances for their venue"
ON public.stock_balances FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock balances for their venue"
ON public.stock_balances FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- stock_movements RLS
DROP POLICY IF EXISTS "Allow all operations on stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Gerencia can view stock movements" ON public.stock_movements;

CREATE POLICY "Users can view stock movements for their venue"
ON public.stock_movements FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock movements for their venue"
ON public.stock_movements FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- stock_transfers RLS
DROP POLICY IF EXISTS "Admins can manage stock transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Everyone can view stock transfers" ON public.stock_transfers;

CREATE POLICY "Users can view stock transfers for their venue"
ON public.stock_transfers FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock transfers for their venue"
ON public.stock_transfers FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- stock_transfer_items RLS
DROP POLICY IF EXISTS "Admins can manage stock transfer items" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "Everyone can view stock transfer items" ON public.stock_transfer_items;

CREATE POLICY "Users can view stock transfer items for their venue"
ON public.stock_transfer_items FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock transfer items for their venue"
ON public.stock_transfer_items FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- stock_alerts RLS
DROP POLICY IF EXISTS "Allow all operations on stock_alerts" ON public.stock_alerts;
DROP POLICY IF EXISTS "Gerencia can view stock alerts" ON public.stock_alerts;

CREATE POLICY "Users can view stock alerts for their venue"
ON public.stock_alerts FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock alerts for their venue"
ON public.stock_alerts FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- stock_predictions RLS
DROP POLICY IF EXISTS "Allow all operations on stock_predictions" ON public.stock_predictions;
DROP POLICY IF EXISTS "Gerencia can view stock predictions" ON public.stock_predictions;

CREATE POLICY "Users can view stock predictions for their venue"
ON public.stock_predictions FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock predictions for their venue"
ON public.stock_predictions FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- sale_items RLS
DROP POLICY IF EXISTS "Admins can manage all sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Admins can view all sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Gerencia can view all sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Sellers can create sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Users can view their sale items" ON public.sale_items;

CREATE POLICY "Users can view sale items for their venue"
ON public.sale_items FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage sale items for their venue"
ON public.sale_items FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can create sale items for their venue"
ON public.sale_items FOR INSERT
WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'));

-- ticket_sale_items RLS
DROP POLICY IF EXISTS "Admins can manage ticket sale items" ON public.ticket_sale_items;
DROP POLICY IF EXISTS "Gerencia can view ticket sale items" ON public.ticket_sale_items;
DROP POLICY IF EXISTS "Ticket sellers can create ticket sale items" ON public.ticket_sale_items;
DROP POLICY IF EXISTS "Ticket sellers can view own ticket sale items" ON public.ticket_sale_items;

CREATE POLICY "Users can view ticket sale items for their venue"
ON public.ticket_sale_items FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage ticket sale items for their venue"
ON public.ticket_sale_items FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Ticket sellers can create ticket sale items for their venue"
ON public.ticket_sale_items FOR INSERT
WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'ticket_seller'));

-- pickup_redemptions_log RLS
DROP POLICY IF EXISTS "Admins can view redemption logs" ON public.pickup_redemptions_log;
DROP POLICY IF EXISTS "Gerencia can view redemption logs" ON public.pickup_redemptions_log;

CREATE POLICY "Users can view redemption logs for their venue"
ON public.pickup_redemptions_log FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "System can insert redemption logs"
ON public.pickup_redemptions_log FOR INSERT
WITH CHECK (true);

-- replenishment_plans RLS
DROP POLICY IF EXISTS "Admins can manage replenishment plans" ON public.replenishment_plans;
DROP POLICY IF EXISTS "Gerencia can view replenishment plans" ON public.replenishment_plans;

CREATE POLICY "Users can view replenishment plans for their venue"
ON public.replenishment_plans FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage replenishment plans for their venue"
ON public.replenishment_plans FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- replenishment_plan_items RLS
ALTER TABLE public.replenishment_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view replenishment plan items for their venue"
ON public.replenishment_plan_items FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage replenishment plan items for their venue"
ON public.replenishment_plan_items FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- cash_registers RLS
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cash registers for their venue"
ON public.cash_registers FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage cash registers for their venue"
ON public.cash_registers FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- login_history RLS
DROP POLICY IF EXISTS "Admins can view all login history" ON public.login_history;
DROP POLICY IF EXISTS "Allow insert login history" ON public.login_history;
DROP POLICY IF EXISTS "Gerencia can view all login history" ON public.login_history;
DROP POLICY IF EXISTS "Users can view their own login history" ON public.login_history;

CREATE POLICY "Users can view login history for their venue"
ON public.login_history FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "System can insert login history"
ON public.login_history FOR INSERT
WITH CHECK (true);

-- admin_audit_logs RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view admin audit logs for their venue"
ON public.admin_audit_logs FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can insert admin audit logs for their venue"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- jornada_config RLS
DROP POLICY IF EXISTS "Admins can manage jornada config" ON public.jornada_config;
DROP POLICY IF EXISTS "Everyone can view jornada config" ON public.jornada_config;
DROP POLICY IF EXISTS "Gerencia can view jornada config" ON public.jornada_config;

CREATE POLICY "Users can view jornada config for their venue"
ON public.jornada_config FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage jornada config for their venue"
ON public.jornada_config FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- invoicing_config RLS
DROP POLICY IF EXISTS "Admins can manage invoicing config" ON public.invoicing_config;
DROP POLICY IF EXISTS "Everyone can view invoicing config" ON public.invoicing_config;

CREATE POLICY "Users can view invoicing config for their venue"
ON public.invoicing_config FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage invoicing config for their venue"
ON public.invoicing_config FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- sales_documents RLS
ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sales documents for their venue"
ON public.sales_documents FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage sales documents for their venue"
ON public.sales_documents FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- =====================================================
-- UPDATE EXISTING RLS POLICIES TO USE venue_id
-- =====================================================

-- Update jornadas policies
DROP POLICY IF EXISTS "Admins can manage jornadas" ON public.jornadas;
DROP POLICY IF EXISTS "Everyone can view jornadas" ON public.jornadas;
DROP POLICY IF EXISTS "Gerencia can view jornadas" ON public.jornadas;
DROP POLICY IF EXISTS "Vendedor can view active jornadas" ON public.jornadas;

CREATE POLICY "Users can view jornadas for their venue"
ON public.jornadas FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage jornadas for their venue"
ON public.jornadas FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- Update sales policies
DROP POLICY IF EXISTS "Admins can manage all sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can view all sales" ON public.sales;
DROP POLICY IF EXISTS "Gerencia can view all sales" ON public.sales;
DROP POLICY IF EXISTS "Sellers can cancel their own sales" ON public.sales;
DROP POLICY IF EXISTS "Sellers can create sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;

CREATE POLICY "Users can view sales for their venue"
ON public.sales FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage sales for their venue"
ON public.sales FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can create sales for their venue"
ON public.sales FOR INSERT
WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Sellers can update their own sales"
ON public.sales FOR UPDATE
USING (venue_id = get_user_venue_id() AND seller_id = auth.uid());

-- Update ticket_sales policies
DROP POLICY IF EXISTS "Admins can manage ticket sales" ON public.ticket_sales;
DROP POLICY IF EXISTS "Gerencia can view ticket sales" ON public.ticket_sales;
DROP POLICY IF EXISTS "Ticket sellers can create ticket sales" ON public.ticket_sales;
DROP POLICY IF EXISTS "Ticket sellers can view own ticket sales" ON public.ticket_sales;

CREATE POLICY "Users can view ticket sales for their venue"
ON public.ticket_sales FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage ticket sales for their venue"
ON public.ticket_sales FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Ticket sellers can create ticket sales for their venue"
ON public.ticket_sales FOR INSERT
WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'ticket_seller'));

-- Update pickup_tokens policies
DROP POLICY IF EXISTS "Admins can manage pickup tokens" ON public.pickup_tokens;
DROP POLICY IF EXISTS "Bar can view issued tokens" ON public.pickup_tokens;
DROP POLICY IF EXISTS "Gerencia can view pickup tokens" ON public.pickup_tokens;
DROP POLICY IF EXISTS "Sellers can create tokens for their sales" ON public.pickup_tokens;
DROP POLICY IF EXISTS "Sellers can view their sale tokens" ON public.pickup_tokens;
DROP POLICY IF EXISTS "Ticket sellers can create cover tokens" ON public.pickup_tokens;
DROP POLICY IF EXISTS "Ticket sellers can view own ticket tokens" ON public.pickup_tokens;

CREATE POLICY "Users can view pickup tokens for their venue"
ON public.pickup_tokens FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage pickup tokens for their venue"
ON public.pickup_tokens FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can create tokens for their venue"
ON public.pickup_tokens FOR INSERT
WITH CHECK (venue_id = get_user_venue_id() AND (has_role(auth.uid(), 'vendedor') OR has_role(auth.uid(), 'ticket_seller')));

-- Update expenses policies
DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Everyone can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Gerencia can view expenses" ON public.expenses;

CREATE POLICY "Users can view expenses for their venue"
ON public.expenses FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage expenses for their venue"
ON public.expenses FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- Update products policies
DROP POLICY IF EXISTS "Admins can manage all products" ON public.products;
DROP POLICY IF EXISTS "Everyone can view products" ON public.products;
DROP POLICY IF EXISTS "Gerencia can view products" ON public.products;

CREATE POLICY "Users can view products for their venue"
ON public.products FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage products for their venue"
ON public.products FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- Update pos_terminals policies
DROP POLICY IF EXISTS "Admins can manage POS terminals" ON public.pos_terminals;
DROP POLICY IF EXISTS "Everyone can view POS terminals" ON public.pos_terminals;

CREATE POLICY "Users can view POS terminals for their venue"
ON public.pos_terminals FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage POS terminals for their venue"
ON public.pos_terminals FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- Update stock_locations policies
DROP POLICY IF EXISTS "Admins can manage stock locations" ON public.stock_locations;
DROP POLICY IF EXISTS "Everyone can view stock locations" ON public.stock_locations;

CREATE POLICY "Users can view stock locations for their venue"
ON public.stock_locations FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage stock locations for their venue"
ON public.stock_locations FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));

-- Update ticket_types policies
DROP POLICY IF EXISTS "Admins can manage ticket types" ON public.ticket_types;
DROP POLICY IF EXISTS "Everyone can view ticket types" ON public.ticket_types;

CREATE POLICY "Users can view ticket types for their venue"
ON public.ticket_types FOR SELECT
USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage ticket types for their venue"
ON public.ticket_types FOR ALL
USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'));