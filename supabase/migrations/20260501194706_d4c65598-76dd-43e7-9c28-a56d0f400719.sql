-- ============================================================
-- FIX A+B+E: Cuadre exacto de cajas (incluye tickets y conteo físico)
-- ============================================================

-- 1) Actualizar close_jornada_manual: incluir ticket_sales y closing_cash_counted
CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id uuid,
  p_cash_closings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada RECORD;
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_pos_ids uuid[];
  v_required_pos uuid[];
  v_missing_pos uuid[];
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
BEGIN
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada', 'failing_step', 'jornada_exists');
  END IF;
  IF v_jornada.estado <> 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está activa (estado: ' || v_jornada.estado || ')', 'failing_step', 'jornada_active');
  END IF;

  v_venue_id := v_jornada.venue_id;

  SELECT array_agg(id) INTO v_required_pos
  FROM pos_terminals
  WHERE venue_id = v_venue_id AND is_active = true AND is_cash_register = true;
  IF v_required_pos IS NULL THEN v_required_pos := ARRAY[]::uuid[]; END IF;

  SELECT array_agg((elem->>'pos_id')::uuid) INTO v_pos_ids
  FROM jsonb_array_elements(p_cash_closings) AS elem;
  IF v_pos_ids IS NULL THEN v_pos_ids := ARRAY[]::uuid[]; END IF;

  SELECT array_agg(rp) INTO v_missing_pos
  FROM unnest(v_required_pos) AS rp
  WHERE rp <> ALL(v_pos_ids);

  IF v_missing_pos IS NOT NULL AND array_length(v_missing_pos, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Faltan confirmaciones para ' || array_length(v_missing_pos, 1) || ' POS', 'failing_step', 'missing_pos', 'missing_pos_ids', to_jsonb(v_missing_pos));
  END IF;

  FOR v_closing IN
    SELECT (elem->>'pos_id')::uuid AS pos_id,
           COALESCE((elem->>'confirmed')::boolean, false) AS confirmed,
           COALESCE(trim(elem->>'bartender_name'), '') AS bartender_name,
           COALESCE(elem->>'notes', '') AS notes,
           NULLIF(elem->>'closing_cash_counted', '')::numeric AS closing_cash_counted
    FROM jsonb_array_elements(p_cash_closings) AS elem
  LOOP
    IF NOT v_closing.confirmed THEN
      RETURN jsonb_build_object('success', false, 'error', 'Debes confirmar el cuadre físico de todos los POS', 'failing_step', 'confirmation_required', 'pos_id', v_closing.pos_id);
    END IF;
    IF v_closing.bartender_name = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Debes registrar el nombre del bartender/cajero de turno', 'failing_step', 'bartender_required', 'pos_id', v_closing.pos_id);
    END IF;

    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_closing.pos_id LIMIT 1;
    IF v_opening_cash IS NULL THEN v_opening_cash := 0; END IF;

    -- Ventas en efectivo de ALCOHOL
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales_alcohol
    FROM sales
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND is_cancelled = false
      AND pos_id = v_closing.pos_id;

    -- Ventas en efectivo de TICKETS (críticamente faltaba)
    SELECT COALESCE(SUM(total), 0) INTO v_cash_sales_tickets
    FROM ticket_sales
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND payment_status = 'paid'
      AND pos_id = v_closing.pos_id;

    v_cash_sales := COALESCE(v_cash_sales_alcohol, 0) + COALESCE(v_cash_sales_tickets, 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM expenses
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND (pos_id = v_closing.pos_id OR pos_id IS NULL);

    v_expected := v_opening_cash + v_cash_sales - v_cash_expenses;
    v_counted := v_closing.closing_cash_counted; -- puede ser NULL
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
      v_closing.bartender_name, true
    )
    ON CONFLICT (jornada_id, pos_id) DO UPDATE SET
      opening_cash_amount = EXCLUDED.opening_cash_amount,
      cash_sales_total = EXCLUDED.cash_sales_total,
      expected_cash = EXCLUDED.expected_cash,
      closing_cash_counted = EXCLUDED.closing_cash_counted,
      difference = EXCLUDED.difference,
      notes = EXCLUDED.notes,
      bartender_name = EXCLUDED.bartender_name,
      physical_reconciliation_confirmed = true;
  END LOOP;

  v_hora_cierre := (v_now_santiago AT TIME ZONE 'America/Santiago')::time;
  UPDATE jornadas SET estado = 'cerrada', hora_cierre = v_hora_cierre, updated_at = v_now_santiago WHERE id = p_jornada_id;

  INSERT INTO jornada_audit_log (jornada_id, venue_id, action, actor_user_id, actor_source, meta)
  VALUES (p_jornada_id, v_venue_id, 'closed', v_user_id, 'manual', jsonb_build_object(
    'cash_closings_count', jsonb_array_length(p_cash_closings),
    'mode', 'physical_checklist'
  ));

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 2) BACKFILL: recalcular cash_sales_total y expected_cash incluyendo tickets
-- Para todas las jornadas cerradas existentes
WITH cash_by_pos AS (
  SELECT
    jcc.id AS closing_id,
    jcc.jornada_id,
    jcc.pos_id,
    jcc.opening_cash_amount,
    COALESCE(jcc.closing_cash_counted, NULL) AS counted,
    (
      SELECT COALESCE(SUM(s.total_amount), 0)
      FROM sales s
      WHERE s.jornada_id = jcc.jornada_id
        AND s.pos_id = jcc.pos_id
        AND s.payment_method = 'cash'
        AND s.is_cancelled = false
    ) AS cash_alcohol,
    (
      SELECT COALESCE(SUM(t.total), 0)
      FROM ticket_sales t
      WHERE t.jornada_id = jcc.jornada_id
        AND t.pos_id = jcc.pos_id
        AND t.payment_method = 'cash'
        AND t.payment_status = 'paid'
    ) AS cash_tickets,
    (
      SELECT COALESCE(SUM(e.amount), 0)
      FROM expenses e
      WHERE e.jornada_id = jcc.jornada_id
        AND (e.pos_id = jcc.pos_id OR e.pos_id IS NULL)
        AND e.payment_method = 'cash'
    ) AS cash_expenses
  FROM jornada_cash_closings jcc
)
UPDATE jornada_cash_closings jcc
SET
  cash_sales_total = (cb.cash_alcohol + cb.cash_tickets),
  expected_cash = (jcc.opening_cash_amount + cb.cash_alcohol + cb.cash_tickets - cb.cash_expenses),
  difference = CASE
    WHEN cb.counted IS NULL THEN NULL
    ELSE cb.counted - (jcc.opening_cash_amount + cb.cash_alcohol + cb.cash_tickets - cb.cash_expenses)
  END
FROM cash_by_pos cb
WHERE cb.closing_id = jcc.id;