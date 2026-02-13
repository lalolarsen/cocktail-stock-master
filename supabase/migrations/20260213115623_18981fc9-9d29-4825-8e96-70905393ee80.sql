
-- 1) Add forced close columns to jornadas
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS forced_close boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forced_reason text,
  ADD COLUMN IF NOT EXISTS forced_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS forced_at timestamptz,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_jornadas_requires_review ON public.jornadas(requires_review) WHERE requires_review = true;

-- 2) Create force_close_jornada RPC
CREATE OR REPLACE FUNCTION public.force_close_jornada(
  p_jornada_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_jornada record;
  v_venue_id uuid;
  v_is_admin boolean;
  v_is_gerencia boolean;
  v_difference_total numeric := 0;
  v_pos record;
  v_opening_cash numeric;
  v_cash_sales numeric;
  v_cash_expenses numeric;
  v_expected numeric;
  v_now timestamptz := now();
BEGIN
  -- Validate role
  SELECT has_role(v_user_id, 'admin') INTO v_is_admin;
  SELECT has_role(v_user_id, 'gerencia') INTO v_is_gerencia;

  IF NOT (v_is_admin OR v_is_gerencia) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado: solo admin o gerencia pueden forzar cierre', 'failing_step', 'authorization');
  END IF;

  -- Validate jornada exists and is active
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada', 'failing_step', 'jornada_not_found');
  END IF;
  IF v_jornada.estado <> 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está activa', 'failing_step', 'jornada_not_active');
  END IF;

  v_venue_id := v_jornada.venue_id;

  -- Validate reason length
  IF p_reason IS NULL OR length(trim(p_reason)) < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El motivo debe tener al menos 30 caracteres', 'failing_step', 'reason_too_short');
  END IF;

  -- Calculate total cash difference across all cash-register POS
  FOR v_pos IN
    SELECT id FROM pos_terminals
    WHERE venue_id = v_venue_id AND is_active = true AND is_cash_register = true
  LOOP
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id
    LIMIT 1;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM sales
    WHERE jornada_id = p_jornada_id AND venue_id = v_venue_id
      AND payment_method = 'cash' AND is_cancelled = false;

    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM expenses
    WHERE jornada_id = p_jornada_id AND venue_id = v_venue_id
      AND payment_method = 'cash';

    v_expected := v_opening_cash + v_cash_sales - v_cash_expenses;
    v_difference_total := v_difference_total + (0 - v_expected); -- No counted cash available
  END LOOP;

  -- If there's a cash difference, create an adjustment expense
  IF abs(v_difference_total) > 0.01 THEN
    INSERT INTO expenses (
      jornada_id, venue_id, created_by, expense_type, expense_category,
      description, amount, payment_method, source_type, notes
    ) VALUES (
      p_jornada_id, v_venue_id, v_user_id,
      CASE WHEN v_difference_total < 0 THEN 'cash_adjustment' ELSE 'cash_adjustment' END,
      'ajuste_caja',
      'Ajuste automático por cierre forzado de jornada',
      abs(v_difference_total),
      'cash',
      'forced_close',
      p_reason
    );
  END IF;

  -- Close the jornada
  UPDATE jornadas SET
    estado = 'cerrada',
    hora_cierre = v_now::time,
    forced_close = true,
    forced_reason = trim(p_reason),
    forced_by_user_id = v_user_id,
    forced_at = v_now,
    requires_review = true,
    updated_at = v_now
  WHERE id = p_jornada_id;

  -- Audit log
  INSERT INTO jornada_audit_log (
    jornada_id, venue_id, actor_user_id, actor_source, action, reason, meta
  ) VALUES (
    p_jornada_id, v_venue_id, v_user_id, 'ui', 'forced_close',
    trim(p_reason),
    jsonb_build_object(
      'difference_total', v_difference_total,
      'reason', trim(p_reason),
      'adjustment_created', abs(v_difference_total) > 0.01
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'difference_total', v_difference_total
  );
END;
$$;
