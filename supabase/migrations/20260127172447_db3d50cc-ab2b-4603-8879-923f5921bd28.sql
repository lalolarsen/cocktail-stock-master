-- =====================================================
-- DEVELOPER RESET SYSTEM - Complete Multi-Venue Reset Tool
-- =====================================================

-- 1) Create resettable_tables whitelist
CREATE TABLE IF NOT EXISTS public.resettable_tables (
  key text PRIMARY KEY,
  table_name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  danger_level smallint NOT NULL DEFAULT 1, -- 1=normal, 2=alto, 3=crítico
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resettable_tables ENABLE ROW LEVEL SECURITY;

-- Only developers can manage
CREATE POLICY "Developers can read resettable_tables"
  ON public.resettable_tables FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

-- 2) Populate with venue-scoped operational tables
-- These are tables that have venue_id and are safe to reset per-venue
INSERT INTO public.resettable_tables (key, table_name, description, danger_level, sort_order) VALUES
  -- Low danger (logs, audit, temporary)
  ('pickup_redemptions_log', 'pickup_redemptions_log', 'Historial de escaneos QR', 1, 10),
  ('login_history', 'login_history', 'Historial de inicios de sesión', 1, 11),
  ('login_attempts', 'login_attempts', 'Intentos de login fallidos', 1, 12),
  ('notification_logs', 'notification_logs', 'Logs de notificaciones enviadas', 1, 13),
  ('demo_event_logs', 'demo_event_logs', 'Logs de eventos demo', 1, 14),
  ('app_audit_events', 'app_audit_events', 'Eventos de auditoría de app', 1, 15),
  ('app_error_logs', 'app_error_logs', 'Logs de errores de aplicación', 1, 16),
  ('admin_audit_logs', 'admin_audit_logs', 'Logs de auditoría admin', 1, 17),
  ('jornada_audit_log', 'jornada_audit_log', 'Auditoría de jornadas', 1, 18),
  
  -- Medium danger (operational data)
  ('pickup_tokens', 'pickup_tokens', 'Tokens QR de retiro', 2, 30),
  ('stock_movements', 'stock_movements', 'Movimientos de inventario', 2, 31),
  ('stock_alerts', 'stock_alerts', 'Alertas de stock bajo', 2, 32),
  ('stock_predictions', 'stock_predictions', 'Predicciones de consumo', 2, 33),
  ('stock_balances', 'stock_balances', 'Saldos de stock por ubicación', 2, 34),
  ('stock_transfer_items', 'stock_transfer_items', 'Items de transferencias', 2, 35),
  ('stock_transfers', 'stock_transfers', 'Transferencias de stock', 2, 36),
  ('expenses', 'expenses', 'Gastos declarados', 2, 37),
  ('notification_preferences', 'notification_preferences', 'Preferencias de notificación', 2, 38),
  ('gross_income_entries', 'gross_income_entries', 'Entradas de ingreso bruto', 2, 39),
  
  -- High danger (financial/sales data)
  ('sale_items', 'sale_items', 'Items de ventas de alcohol', 3, 50),
  ('sales', 'sales', 'Ventas de alcohol', 3, 51),
  ('ticket_sale_items', 'ticket_sale_items', 'Items de ventas de tickets', 3, 52),
  ('ticket_sales', 'ticket_sales', 'Ventas de tickets', 3, 53),
  ('jornada_cash_openings', 'jornada_cash_openings', 'Aperturas de caja', 3, 54),
  ('jornada_cash_closings', 'jornada_cash_closings', 'Cierres de caja', 3, 55),
  ('jornada_financial_summary', 'jornada_financial_summary', 'Resúmenes financieros', 3, 56),
  ('cash_registers', 'cash_registers', 'Registros de caja', 3, 57),
  ('jornadas', 'jornadas', 'Jornadas operativas', 3, 58),
  
  -- Catalog (careful - affects menu)
  ('cocktail_ingredients', 'cocktail_ingredients', 'Ingredientes de cocktails', 2, 70),
  ('cocktails', 'cocktails', 'Carta de cocktails', 2, 71),
  ('products', 'products', 'Productos de inventario', 2, 72),
  ('ticket_types', 'ticket_types', 'Tipos de tickets', 2, 73),
  
  -- Config (per-venue settings)
  ('jornada_config', 'jornada_config', 'Configuración de jornadas', 2, 80),
  ('jornada_cash_settings', 'jornada_cash_settings', 'Configuración de caja', 2, 81),
  ('jornada_cash_pos_defaults', 'jornada_cash_pos_defaults', 'Defaults de caja por POS', 2, 82),
  ('invoicing_config', 'invoicing_config', 'Configuración de facturación', 2, 83),
  ('sidebar_config', 'sidebar_config', 'Configuración de sidebar', 2, 84),
  ('pos_terminals', 'pos_terminals', 'Terminales de punto de venta', 2, 85),
  ('stock_locations', 'stock_locations', 'Ubicaciones de stock', 2, 86),
  
  -- Purchase documents
  ('purchase_items', 'purchase_items', 'Items de documentos de compra', 2, 90),
  ('purchase_documents', 'purchase_documents', 'Documentos de compra', 2, 91),
  ('product_name_mappings', 'product_name_mappings', 'Mapeos de nombres de productos', 1, 92),
  ('provider_product_mappings', 'provider_product_mappings', 'Mapeos de productos de proveedores', 1, 93),
  
  -- Replenishment
  ('replenishment_plan_items', 'replenishment_plan_items', 'Items de planes de reposición', 2, 95),
  ('replenishment_plans', 'replenishment_plans', 'Planes de reposición', 2, 96)
ON CONFLICT (key) DO NOTHING;

-- 3) Create developer reset audit table
CREATE TABLE IF NOT EXISTS public.developer_reset_audit (
  id bigserial PRIMARY KEY,
  developer_user_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES venues(id),
  table_key text NOT NULL,
  table_name text NOT NULL,
  deleted_rows bigint NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by venue and time
CREATE INDEX IF NOT EXISTS idx_developer_reset_audit_venue 
  ON public.developer_reset_audit(venue_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_developer_reset_audit_developer 
  ON public.developer_reset_audit(developer_user_id, executed_at DESC);

-- Enable RLS
ALTER TABLE public.developer_reset_audit ENABLE ROW LEVEL SECURITY;

-- Only developers can see audit
CREATE POLICY "Developers can read reset audit"
  ON public.developer_reset_audit FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

CREATE POLICY "System can insert reset audit"
  ON public.developer_reset_audit FOR INSERT
  WITH CHECK (true);

-- 4) Create secure RPC for single table reset
CREATE OR REPLACE FUNCTION public.developer_reset_table(
  p_venue_id uuid,
  p_table_key text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name text;
  v_deleted_rows bigint;
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Verify developer role
  IF NOT has_role(v_user_id, 'developer') THEN
    RAISE EXCEPTION 'Forbidden: Only developers can reset tables';
  END IF;
  
  -- Validate venue exists
  IF NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'Invalid venue_id';
  END IF;
  
  -- Get table_name from whitelist
  SELECT table_name INTO v_table_name
  FROM resettable_tables
  WHERE key = p_table_key AND is_enabled = true;
  
  IF v_table_name IS NULL THEN
    RAISE EXCEPTION 'Table key "%" not found or not enabled', p_table_key;
  END IF;
  
  -- Execute delete dynamically (ONLY whitelisted tables)
  EXECUTE format('DELETE FROM public.%I WHERE venue_id = $1', v_table_name)
  USING p_venue_id;
  
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
  
  -- Insert audit record
  INSERT INTO developer_reset_audit (
    developer_user_id,
    venue_id,
    table_key,
    table_name,
    deleted_rows
  ) VALUES (
    v_user_id,
    p_venue_id,
    p_table_key,
    v_table_name,
    v_deleted_rows
  );
  
  RETURN v_deleted_rows;
END;
$$;

-- 5) Create RPC for full venue operational reset
CREATE OR REPLACE FUNCTION public.developer_reset_venue_operational(
  p_venue_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_table_key text;
  v_deleted bigint;
  v_reset_order text[] := ARRAY[
    -- Order matters: delete children before parents
    'pickup_redemptions_log',
    'pickup_tokens',
    'sale_items',
    'sales',
    'ticket_sale_items',
    'ticket_sales',
    'stock_movements',
    'stock_alerts',
    'stock_predictions',
    'stock_balances',
    'stock_transfer_items',
    'stock_transfers',
    'expenses',
    'gross_income_entries',
    'jornada_cash_openings',
    'jornada_cash_closings',
    'jornada_financial_summary',
    'cash_registers',
    'jornada_audit_log',
    'jornadas',
    'login_history',
    'login_attempts',
    'notification_logs',
    'demo_event_logs',
    'app_audit_events',
    'app_error_logs',
    'admin_audit_logs'
  ];
BEGIN
  -- Verify developer role
  v_user_id := auth.uid();
  IF NOT has_role(v_user_id, 'developer') THEN
    RAISE EXCEPTION 'Forbidden: Only developers can reset venues';
  END IF;
  
  -- Validate venue exists
  IF NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'Invalid venue_id';
  END IF;
  
  -- Reset each table in order
  FOREACH v_table_key IN ARRAY v_reset_order
  LOOP
    BEGIN
      -- Only reset if table is in whitelist and enabled
      IF EXISTS (SELECT 1 FROM resettable_tables WHERE key = v_table_key AND is_enabled = true) THEN
        v_deleted := developer_reset_table(p_venue_id, v_table_key);
        v_result := v_result || jsonb_build_object(
          'table_key', v_table_key,
          'deleted_rows', v_deleted
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      v_result := v_result || jsonb_build_object(
        'table_key', v_table_key,
        'error', SQLERRM
      );
    END;
  END LOOP;
  
  RETURN v_result;
END;
$$;

-- 6) Create RPC to get table counts for a venue
CREATE OR REPLACE FUNCTION public.developer_get_table_counts(
  p_venue_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_record record;
  v_count bigint;
BEGIN
  -- Verify developer role
  v_user_id := auth.uid();
  IF NOT has_role(v_user_id, 'developer') THEN
    RAISE EXCEPTION 'Forbidden: Only developers can view table counts';
  END IF;
  
  -- Get counts for each enabled table
  FOR v_record IN 
    SELECT key, table_name 
    FROM resettable_tables 
    WHERE is_enabled = true
    ORDER BY sort_order
  LOOP
    BEGIN
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE venue_id = $1', v_record.table_name)
      INTO v_count
      USING p_venue_id;
      
      v_result := v_result || jsonb_build_object(v_record.key, v_count);
    EXCEPTION WHEN OTHERS THEN
      -- Table might not have venue_id or doesn't exist
      v_result := v_result || jsonb_build_object(v_record.key, -1);
    END;
  END LOOP;
  
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (RPCs check developer role internally)
GRANT EXECUTE ON FUNCTION public.developer_reset_table(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.developer_reset_venue_operational(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.developer_get_table_counts(uuid) TO authenticated;