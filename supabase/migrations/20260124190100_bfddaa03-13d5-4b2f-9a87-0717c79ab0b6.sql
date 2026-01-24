-- Create new feature_flags_master table for flag definitions
CREATE TABLE IF NOT EXISTS public.feature_flags_master (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create venue_feature_flags for per-venue overrides
CREATE TABLE IF NOT EXISTS public.venue_feature_flags (
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL REFERENCES public.feature_flags_master(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, flag_key)
);

-- Enable RLS
ALTER TABLE public.feature_flags_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS: feature_flags_master - only developer can read
CREATE POLICY "Developers can read feature flags master"
ON public.feature_flags_master
FOR SELECT
USING (has_role(auth.uid(), 'developer'::app_role));

-- RLS: venue_feature_flags - only developer can CRUD
CREATE POLICY "Developers can manage venue feature flags"
ON public.venue_feature_flags
FOR ALL
USING (has_role(auth.uid(), 'developer'::app_role))
WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

-- Create function to get effective flags for a venue
CREATE OR REPLACE FUNCTION public.get_effective_flags(p_venue_id UUID)
RETURNS TABLE (
  flag_key TEXT,
  flag_name TEXT,
  description TEXT,
  enabled BOOLEAN,
  is_overridden BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fm.key AS flag_key,
    fm.name AS flag_name,
    fm.description,
    COALESCE(vf.enabled, fm.default_enabled) AS enabled,
    (vf.enabled IS NOT NULL) AS is_overridden
  FROM public.feature_flags_master fm
  LEFT JOIN public.venue_feature_flags vf 
    ON vf.flag_key = fm.key 
    AND vf.venue_id = p_venue_id
  ORDER BY fm.key;
END;
$$;

-- Create function to set a venue flag (upsert)
CREATE OR REPLACE FUNCTION public.set_venue_flag(
  p_venue_id UUID,
  p_flag_key TEXT,
  p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is developer
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RAISE EXCEPTION 'Only developers can modify venue flags';
  END IF;

  INSERT INTO public.venue_feature_flags (venue_id, flag_key, enabled, updated_at)
  VALUES (p_venue_id, p_flag_key, p_enabled, now())
  ON CONFLICT (venue_id, flag_key)
  DO UPDATE SET enabled = p_enabled, updated_at = now();
END;
$$;

-- Create function to reset venue flags to defaults
CREATE OR REPLACE FUNCTION public.reset_venue_flags(p_venue_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is developer
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RAISE EXCEPTION 'Only developers can reset venue flags';
  END IF;

  DELETE FROM public.venue_feature_flags WHERE venue_id = p_venue_id;
END;
$$;

-- Seed baseline flags (DEFAULT ENABLED = TRUE)
INSERT INTO public.feature_flags_master (key, name, description, default_enabled) VALUES
  ('ff_jornadas_enabled', 'Jornadas', 'Sistema de jornadas de trabajo', true),
  ('ff_cash_count_enabled', 'Conteo de Caja', 'Apertura y cierre de caja', true),
  ('ff_sales_alcohol_enabled', 'Ventas Alcohol', 'Módulo de ventas de alcohol', true),
  ('ff_sales_tickets_enabled', 'Ventas Entradas', 'Módulo de venta de entradas', true),
  ('ff_payment_cash_card_only', 'Solo Efectivo/Tarjeta', 'Métodos de pago limitados', true),
  ('ff_bar_reader_enabled', 'Lector Bar', 'Escaneo de QR en barra', true),
  ('ff_qr_history_enabled', 'Historial QR', 'Historial de canjes QR', true),
  ('ff_inventory_base_enabled', 'Inventario Base', 'Gestión básica de inventario', true),
  ('ff_inventory_restock_manual_enabled', 'Reposición Manual', 'Reposición manual de stock', true),
  ('ff_expenses_enabled', 'Gastos', 'Registro de gastos', true),
  ('ff_financial_summary_enabled', 'Resumen Financiero', 'Resumen financiero de jornada', true)
ON CONFLICT (key) DO NOTHING;

-- Seed baseline flags (DEFAULT ENABLED = FALSE)
INSERT INTO public.feature_flags_master (key, name, description, default_enabled) VALUES
  ('ff_courtesy_qr_enabled', 'QR Cortesía', 'Generación de QR de cortesía', false),
  ('ff_cloakroom_enabled', 'Guardarropía', 'Módulo de guardarropía', false),
  ('ff_cogs_enabled', 'COGS', 'Cálculo de costo de ventas', false),
  ('ff_cost_per_sale_enabled', 'Costo por Venta', 'Costo por venta individual', false),
  ('ff_margin_kpis_enabled', 'KPIs Margen', 'Indicadores de margen', false),
  ('ff_inventory_batches_enabled', 'Lotes Inventario', 'Gestión por lotes', false),
  ('ff_expiry_batches_enabled', 'Vencimiento Lotes', 'Control de vencimientos', false),
  ('ff_fefo_enabled', 'FEFO', 'First Expired First Out', false),
  ('ff_invoice_reader_enabled', 'Lector Facturas', 'Lectura automática de facturas', false),
  ('ff_auto_restock_suggestions_enabled', 'Sugerencias Reposición', 'Sugerencias automáticas de reposición', false),
  ('ff_attendance_enabled', 'Asistencia', 'Control de asistencia', false),
  ('ff_payroll_enabled', 'Nómina', 'Gestión de nómina', false)
ON CONFLICT (key) DO NOTHING;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_effective_flags(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_venue_flag(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_venue_flags(UUID) TO authenticated;