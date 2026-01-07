-- Create table for immutable jornada financial summaries
CREATE TABLE public.jornada_financial_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id uuid NOT NULL UNIQUE REFERENCES public.jornadas(id) ON DELETE RESTRICT,
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  ingresos_brutos integer NOT NULL DEFAULT 0,
  costo_ventas integer NOT NULL DEFAULT 0,
  utilidad_bruta integer NOT NULL DEFAULT 0,
  margen_bruto numeric(5,2) NOT NULL DEFAULT 0,
  gastos_operacionales integer NOT NULL DEFAULT 0,
  resultado_periodo integer NOT NULL DEFAULT 0,
  closed_by uuid NOT NULL REFERENCES public.profiles(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jornada_financial_summary ENABLE ROW LEVEL SECURITY;

-- Admin can manage (but realistically only insert on close)
CREATE POLICY "Admins can manage jornada financial summaries"
ON public.jornada_financial_summary
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Gerencia can view
CREATE POLICY "Gerencia can view jornada financial summaries"
ON public.jornada_financial_summary
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Gerencia can insert (for closing jornadas)
CREATE POLICY "Gerencia can insert jornada financial summaries"
ON public.jornada_financial_summary
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerencia'::app_role) AND closed_by = auth.uid());

-- Create function to close jornada with financial snapshot
CREATE OR REPLACE FUNCTION public.close_jornada_with_summary(p_jornada_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jornada record;
  v_user_id uuid;
  v_ingresos_brutos integer := 0;
  v_costo_ventas integer := 0;
  v_gastos_operacionales integer := 0;
  v_utilidad_bruta integer;
  v_margen_bruto numeric(5,2);
  v_resultado_periodo integer;
  v_summary_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Check user has permission (admin or gerencia)
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'gerencia'::app_role)) THEN
    RETURN json_build_object('success', false, 'error', 'Sin permisos para cerrar jornada');
  END IF;

  -- Get jornada and validate
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  
  IF v_jornada IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Jornada no encontrada');
  END IF;

  IF v_jornada.estado != 'activa' THEN
    RETURN json_build_object('success', false, 'error', 'La jornada no está activa');
  END IF;

  -- Check if already has a summary (shouldn't happen but safety check)
  IF EXISTS (SELECT 1 FROM jornada_financial_summary WHERE jornada_id = p_jornada_id) THEN
    RETURN json_build_object('success', false, 'error', 'La jornada ya tiene un resumen financiero');
  END IF;

  -- Calculate ingresos brutos from gross_income_entries
  SELECT COALESCE(SUM(amount), 0)::integer INTO v_ingresos_brutos
  FROM gross_income_entries
  WHERE jornada_id = p_jornada_id;

  -- Calculate costo de ventas from stock_movements (salida type with unit_cost)
  SELECT COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0)::integer INTO v_costo_ventas
  FROM stock_movements
  WHERE jornada_id = p_jornada_id
    AND movement_type = 'salida';

  -- Calculate gastos operacionales from expenses
  SELECT COALESCE(SUM(amount), 0)::integer INTO v_gastos_operacionales
  FROM expenses
  WHERE jornada_id = p_jornada_id;

  -- Derive calculated values
  v_utilidad_bruta := v_ingresos_brutos - v_costo_ventas;
  
  IF v_ingresos_brutos > 0 THEN
    v_margen_bruto := ROUND((v_utilidad_bruta::numeric / v_ingresos_brutos::numeric) * 100, 2);
  ELSE
    v_margen_bruto := 0;
  END IF;
  
  v_resultado_periodo := v_utilidad_bruta - v_gastos_operacionales;

  -- Insert financial summary
  INSERT INTO jornada_financial_summary (
    jornada_id,
    venue_id,
    ingresos_brutos,
    costo_ventas,
    utilidad_bruta,
    margen_bruto,
    gastos_operacionales,
    resultado_periodo,
    closed_by
  ) VALUES (
    p_jornada_id,
    v_jornada.venue_id,
    v_ingresos_brutos,
    v_costo_ventas,
    v_utilidad_bruta,
    v_margen_bruto,
    v_gastos_operacionales,
    v_resultado_periodo,
    v_user_id
  )
  RETURNING id INTO v_summary_id;

  -- Close the jornada
  UPDATE jornadas
  SET estado = 'cerrada',
      hora_cierre = NOW()::time,
      updated_at = NOW()
  WHERE id = p_jornada_id;

  RETURN json_build_object(
    'success', true,
    'summary_id', v_summary_id,
    'ingresos_brutos', v_ingresos_brutos,
    'costo_ventas', v_costo_ventas,
    'utilidad_bruta', v_utilidad_bruta,
    'margen_bruto', v_margen_bruto,
    'gastos_operacionales', v_gastos_operacionales,
    'resultado_periodo', v_resultado_periodo
  );
END;
$$;

-- Create trigger function to prevent mutations on closed jornadas
CREATE OR REPLACE FUNCTION public.check_jornada_not_closed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_jornada_estado text;
BEGIN
  -- Skip if jornada_id is null
  IF NEW.jornada_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check jornada status
  SELECT estado INTO v_jornada_estado
  FROM jornadas
  WHERE id = NEW.jornada_id;

  IF v_jornada_estado = 'cerrada' THEN
    RAISE EXCEPTION 'No se pueden agregar registros a una jornada cerrada';
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger to gross_income_entries
CREATE TRIGGER check_jornada_closed_gross_income
  BEFORE INSERT ON public.gross_income_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- Apply trigger to expenses
CREATE TRIGGER check_jornada_closed_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- Apply trigger to stock_movements
CREATE TRIGGER check_jornada_closed_stock_movements
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- Apply trigger to sales
CREATE TRIGGER check_jornada_closed_sales
  BEFORE INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- Apply trigger to ticket_sales
CREATE TRIGGER check_jornada_closed_ticket_sales
  BEFORE INSERT ON public.ticket_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- Add index for faster lookups
CREATE INDEX idx_jornada_financial_summary_jornada_id ON public.jornada_financial_summary(jornada_id);
CREATE INDEX idx_jornada_financial_summary_venue_id ON public.jornada_financial_summary(venue_id);