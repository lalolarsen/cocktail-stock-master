-- 1) Trigger con guarda de idempotencia (marca en jornada_audit_log)
CREATE OR REPLACE FUNCTION public.tg_dispatch_jornada_closed_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado = 'cerrada' AND (OLD.estado IS DISTINCT FROM 'cerrada') THEN
    IF EXISTS (
      SELECT 1 FROM jornada_audit_log
      WHERE jornada_id = NEW.id AND action = 'closed_email_dispatched'
    ) THEN
      RETURN NEW;
    END IF;

    BEGIN
      INSERT INTO jornada_audit_log (jornada_id, venue_id, action, actor_user_id, actor_source, meta)
      VALUES (NEW.id, NEW.venue_id, 'closed_email_dispatched', auth.uid(), 'trigger', '{}'::jsonb);

      PERFORM public.dispatch_jornada_closed_email(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'tg_dispatch_jornada_closed_email failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) close_jornada_manual sin llamada directa al despacho (el trigger lo hace)
CREATE OR REPLACE FUNCTION public.close_jornada_manual(p_jornada_id uuid, p_cash_closings jsonb DEFAULT '[]'::jsonb, p_observacion text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada RECORD;
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_closing RECORD;
  v_opening_cash numeric;
  v_cash_sales_alcohol numeric;
  v_cash_sales_tickets numeric;
  v_cash_sales numeric;
  v_cash_expenses numeric;
  v_expected numeric;
  v_counted numeric;
  v_difference numeric;
  v_now_santiago timestamptz := now();
  v_hora_cierre time;
  v_observacion text;
BEGIN
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada', 'failing_step', 'jornada_exists');
  END IF;
  IF v_jornada.estado <> 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está activa (estado: ' || v_jornada.estado || ')', 'failing_step', 'jornada_active');
  END IF;

  v_venue_id := v_jornada.venue_id;
  v_observacion := NULLIF(trim(COALESCE(p_observacion, '')), '');

  IF p_cash_closings IS NOT NULL AND jsonb_typeof(p_cash_closings) = 'array' AND jsonb_array_length(p_cash_closings) > 0 THEN
    FOR v_closing IN
      SELECT (elem->>'pos_id')::uuid AS pos_id,
             COALESCE(trim(elem->>'bartender_name'), '') AS bartender_name,
             COALESCE(elem->>'notes', '') AS notes,
             NULLIF(elem->>'closing_cash_counted', '')::numeric AS closing_cash_counted
      FROM jsonb_array_elements(p_cash_closings) AS elem
      WHERE (elem->>'pos_id') IS NOT NULL
    LOOP
      SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
      FROM jornada_cash_openings
      WHERE jornada_id = p_jornada_id AND pos_id = v_closing.pos_id LIMIT 1;
      IF v_opening_cash IS NULL THEN v_opening_cash := 0; END IF;

      SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales_alcohol
      FROM sales
      WHERE jornada_id = p_jornada_id AND payment_method = 'cash' AND is_cancelled = false AND pos_id = v_closing.pos_id;

      SELECT COALESCE(SUM(total), 0) INTO v_cash_sales_tickets
      FROM ticket_sales
      WHERE jornada_id = p_jornada_id AND payment_method = 'cash' AND payment_status = 'paid' AND pos_id = v_closing.pos_id;

      v_cash_sales := COALESCE(v_cash_sales_alcohol, 0) + COALESCE(v_cash_sales_tickets, 0);

      SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
      FROM expenses
      WHERE jornada_id = p_jornada_id AND payment_method = 'cash' AND (pos_id = v_closing.pos_id OR pos_id IS NULL);

      v_expected := v_opening_cash + v_cash_sales - v_cash_expenses;
      v_counted := v_closing.closing_cash_counted;
      v_difference := CASE WHEN v_counted IS NULL THEN NULL ELSE (v_counted - v_expected) END;

      INSERT INTO jornada_cash_closings (
        jornada_id, pos_id, venue_id, created_by,
        opening_cash_amount, cash_sales_total, expected_cash,
        closing_cash_counted, difference, notes,
        bartender_name, physical_reconciliation_confirmed
      )
      VALUES (
        p_jornada_id, v_closing.pos_id, v_venue_id, v_user_id,
        v_opening_cash, v_cash_sales, v_expected,
        v_counted, v_difference, NULLIF(trim(v_closing.notes), ''),
        NULLIF(v_closing.bartender_name, ''), true
      )
      ON CONFLICT (jornada_id, pos_id) DO UPDATE SET
        opening_cash_amount = EXCLUDED.opening_cash_amount,
        cash_sales_total = EXCLUDED.cash_sales_total,
        expected_cash = EXCLUDED.expected_cash,
        closing_cash_counted = EXCLUDED.closing_cash_counted,
        difference = EXCLUDED.difference,
        notes = EXCLUDED.notes,
        bartender_name = COALESCE(EXCLUDED.bartender_name, jornada_cash_closings.bartender_name),
        physical_reconciliation_confirmed = true;
    END LOOP;
  END IF;

  v_hora_cierre := (v_now_santiago AT TIME ZONE 'America/Santiago')::time;
  UPDATE jornadas
     SET estado = 'cerrada',
         hora_cierre = v_hora_cierre,
         observacion_cierre = v_observacion,
         closed_by_user_id = v_user_id,
         updated_at = v_now_santiago
   WHERE id = p_jornada_id;

  INSERT INTO jornada_audit_log (jornada_id, venue_id, action, actor_user_id, actor_source, meta)
  VALUES (p_jornada_id, v_venue_id, 'closed', v_user_id, 'manual', jsonb_build_object(
    'cash_closings_count', COALESCE(jsonb_array_length(p_cash_closings), 0),
    'mode', 'simple_observation',
    'has_observacion', v_observacion IS NOT NULL
  ));

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 3) close_jornada_with_summary sin llamada directa al despacho
CREATE OR REPLACE FUNCTION public.close_jornada_with_summary(p_jornada_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'gerencia'::app_role)) THEN
    RETURN json_build_object('success', false, 'error', 'Sin permisos para cerrar jornada');
  END IF;

  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Jornada no encontrada');
  END IF;
  IF v_jornada.estado != 'activa' THEN
    RETURN json_build_object('success', false, 'error', 'La jornada no está activa');
  END IF;
  IF EXISTS (SELECT 1 FROM jornada_financial_summary WHERE jornada_id = p_jornada_id) THEN
    RETURN json_build_object('success', false, 'error', 'La jornada ya tiene un resumen financiero');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_ingresos_brutos
  FROM gross_income_entries WHERE jornada_id = p_jornada_id;

  SELECT COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0)::integer INTO v_costo_ventas
  FROM stock_movements WHERE jornada_id = p_jornada_id AND movement_type = 'salida';

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_gastos_operacionales
  FROM expenses WHERE jornada_id = p_jornada_id;

  v_utilidad_bruta := v_ingresos_brutos - v_costo_ventas;
  v_margen_bruto := CASE WHEN v_ingresos_brutos > 0
    THEN ROUND((v_utilidad_bruta::numeric / v_ingresos_brutos::numeric) * 100, 2)
    ELSE 0 END;
  v_resultado_periodo := v_utilidad_bruta - v_gastos_operacionales;

  INSERT INTO jornada_financial_summary (
    jornada_id, venue_id, ingresos_brutos, costo_ventas, utilidad_bruta,
    margen_bruto, gastos_operacionales, resultado_periodo, closed_by
  ) VALUES (
    p_jornada_id, v_jornada.venue_id, v_ingresos_brutos, v_costo_ventas, v_utilidad_bruta,
    v_margen_bruto, v_gastos_operacionales, v_resultado_periodo, v_user_id
  ) RETURNING id INTO v_summary_id;

  UPDATE jornadas SET estado='cerrada', hora_cierre=NOW()::time, updated_at=NOW()
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
$function$;