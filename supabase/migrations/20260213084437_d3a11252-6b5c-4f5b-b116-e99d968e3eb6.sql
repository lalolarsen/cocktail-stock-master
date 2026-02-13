
DROP FUNCTION IF EXISTS public.close_jornada_manual;

CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id uuid,
  p_cash_closings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jornada RECORD;
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_pos_ids uuid[];
  v_required_pos uuid[];
  v_missing_pos uuid[];
  v_closing RECORD;
  v_opening_cash numeric;
  v_cash_sales numeric;
  v_cash_expenses numeric;
  v_expected numeric;
  v_difference numeric;
  v_now_santiago timestamptz := now();
  v_hora_cierre time;
BEGIN
  -- 1) Validate jornada exists and is active
  SELECT * INTO v_jornada
  FROM jornadas
  WHERE id = p_jornada_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada', 'failing_step', 'jornada_exists');
  END IF;

  IF v_jornada.estado <> 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está activa (estado: ' || v_jornada.estado || ')', 'failing_step', 'jornada_active');
  END IF;

  v_venue_id := v_jornada.venue_id;

  -- 2) Get required POS (active cash registers)
  SELECT array_agg(id) INTO v_required_pos
  FROM pos_terminals
  WHERE venue_id = v_venue_id
    AND is_active = true
    AND is_cash_register = true;

  IF v_required_pos IS NULL THEN
    v_required_pos := ARRAY[]::uuid[];
  END IF;

  -- 3) Validate p_cash_closings contains all required POS
  SELECT array_agg((elem->>'pos_id')::uuid) INTO v_pos_ids
  FROM jsonb_array_elements(p_cash_closings) AS elem;

  IF v_pos_ids IS NULL THEN
    v_pos_ids := ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(rp) INTO v_missing_pos
  FROM unnest(v_required_pos) AS rp
  WHERE rp <> ALL(v_pos_ids);

  IF v_missing_pos IS NOT NULL AND array_length(v_missing_pos, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Faltan arqueos para ' || array_length(v_missing_pos, 1) || ' POS',
      'failing_step', 'missing_pos',
      'missing_pos_ids', to_jsonb(v_missing_pos)
    );
  END IF;

  -- 4) Validate and insert each cash closing
  FOR v_closing IN
    SELECT
      (elem->>'pos_id')::uuid AS pos_id,
      (elem->>'closing_cash_counted')::numeric AS closing_cash_counted,
      COALESCE(elem->>'notes', '') AS notes
    FROM jsonb_array_elements(p_cash_closings) AS elem
  LOOP
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_closing.pos_id
    LIMIT 1;

    IF v_opening_cash IS NULL THEN
      v_opening_cash := 0;
    END IF;

    SELECT COALESCE(SUM(total), 0) INTO v_cash_sales
    FROM sales
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND status <> 'cancelled'
      AND (pos_id = v_closing.pos_id::text OR pos_id IS NULL);

    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM expenses
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND (pos_id = v_closing.pos_id OR pos_id IS NULL);

    v_expected := v_opening_cash + v_cash_sales - v_cash_expenses;
    v_difference := v_closing.closing_cash_counted - v_expected;

    IF abs(v_difference) > 0.01 AND (v_closing.notes IS NULL OR trim(v_closing.notes) = '') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'POS con diferencia de $' || round(v_difference, 0) || ' requiere notas justificativas',
        'failing_step', 'notes_required',
        'pos_id', v_closing.pos_id,
        'difference', v_difference
      );
    END IF;

    INSERT INTO jornada_cash_closings (
      jornada_id, pos_id, venue_id, created_by,
      opening_cash_amount, cash_sales_total, expected_cash,
      closing_cash_counted, difference, notes
    ) VALUES (
      p_jornada_id, v_closing.pos_id, v_venue_id, v_user_id,
      v_opening_cash, v_cash_sales, v_expected,
      v_closing.closing_cash_counted, v_difference, NULLIF(trim(v_closing.notes), '')
    );
  END LOOP;

  -- 5) Close the jornada
  v_hora_cierre := (v_now_santiago AT TIME ZONE 'America/Santiago')::time;

  UPDATE jornadas
  SET estado = 'cerrada',
      hora_cierre = v_hora_cierre,
      updated_at = v_now_santiago
  WHERE id = p_jornada_id;

  INSERT INTO jornada_audit_log (jornada_id, venue_id, action, actor_user_id, actor_source, meta)
  VALUES (
    p_jornada_id, v_venue_id, 'close', v_user_id, 'manual',
    jsonb_build_object('cash_closings_count', jsonb_array_length(p_cash_closings))
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
