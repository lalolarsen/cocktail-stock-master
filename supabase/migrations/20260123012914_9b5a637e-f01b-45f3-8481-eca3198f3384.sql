-- ==========================================
-- A) DIAGNOSTICS: Create inspection RPC for payment method data quality
-- ==========================================

CREATE OR REPLACE FUNCTION public.inspect_jornada_payment_methods(p_jornada_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_total int;
  v_sales_null_payment int;
  v_sales_methods text[];
  v_expenses_total int;
  v_expenses_null_payment int;
  v_expenses_methods text[];
BEGIN
  -- Sales statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE payment_method IS NULL),
    ARRAY_AGG(DISTINCT payment_method::text ORDER BY payment_method::text)
  INTO v_sales_total, v_sales_null_payment, v_sales_methods
  FROM public.sales
  WHERE jornada_id = p_jornada_id;
  
  -- Expenses statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE payment_method IS NULL),
    ARRAY_AGG(DISTINCT payment_method ORDER BY payment_method)
  INTO v_expenses_total, v_expenses_null_payment, v_expenses_methods
  FROM public.expenses
  WHERE jornada_id = p_jornada_id;
  
  RETURN jsonb_build_object(
    'jornada_id', p_jornada_id,
    'sales_total_count', COALESCE(v_sales_total, 0),
    'sales_null_payment_count', COALESCE(v_sales_null_payment, 0),
    'sales_distinct_payment_methods', COALESCE(to_jsonb(v_sales_methods), '[]'::jsonb),
    'expenses_total_count', COALESCE(v_expenses_total, 0),
    'expenses_null_payment_count', COALESCE(v_expenses_null_payment, 0),
    'expenses_distinct_payment_methods', COALESCE(to_jsonb(v_expenses_methods), '[]'::jsonb)
  );
END;
$$;

-- ==========================================
-- B) ENHANCED close_jornada_manual with structured error handling
-- ==========================================

CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id uuid,
  p_cash_closings jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_venue_id uuid;
  v_jornada record;
  v_closing jsonb;
  v_opening_cash numeric;
  v_cash_sales numeric;
  v_cash_expenses numeric;
  v_expected_cash numeric;
  v_step text := 'init';
BEGIN
  v_step := 'get_user';
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user', 'failing_step', v_step);
  END IF;
  
  v_step := 'validate_jornada';
  -- Validate jornada exists and is open
  SELECT * INTO v_jornada FROM public.jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada not found', 'failing_step', v_step);
  END IF;
  
  IF v_jornada.estado != 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada is not active', 'failing_step', v_step, 'current_status', v_jornada.estado);
  END IF;
  
  v_venue_id := v_jornada.venue_id;
  
  v_step := 'process_cash_closings';
  -- Process each cash closing entry
  FOR v_closing IN SELECT * FROM jsonb_array_elements(p_cash_closings)
  LOOP
    -- Get opening cash for this POS
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM public.jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = (v_closing->>'pos_id')::uuid;
    
    -- Calculate cash sales for this POS (using valid enum 'cash')
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM public.sales
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::uuid 
      AND payment_method = 'cash'
      AND (is_cancelled = false OR is_cancelled IS NULL);
    
    -- Calculate cash expenses for this POS
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM public.expenses
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::uuid 
      AND payment_method = 'cash';
    
    v_expected_cash := COALESCE(v_opening_cash, 0) + COALESCE(v_cash_sales, 0) - COALESCE(v_cash_expenses, 0);
    
    v_step := 'upsert_cash_closing_' || (v_closing->>'pos_id');
    -- Upsert the cash closing record
    INSERT INTO public.jornada_cash_closings (
      venue_id,
      jornada_id,
      pos_id,
      opening_cash_amount,
      cash_sales_total,
      expected_cash,
      closing_cash_counted,
      difference,
      notes,
      created_by
    ) VALUES (
      v_venue_id,
      p_jornada_id,
      (v_closing->>'pos_id')::uuid,
      COALESCE(v_opening_cash, 0),
      COALESCE(v_cash_sales, 0),
      v_expected_cash,
      COALESCE((v_closing->>'closing_cash_counted')::numeric, 0),
      COALESCE((v_closing->>'closing_cash_counted')::numeric, 0) - v_expected_cash,
      v_closing->>'notes',
      v_user_id
    )
    ON CONFLICT (jornada_id, pos_id) DO UPDATE SET
      opening_cash_amount = EXCLUDED.opening_cash_amount,
      cash_sales_total = EXCLUDED.cash_sales_total,
      expected_cash = EXCLUDED.expected_cash,
      closing_cash_counted = EXCLUDED.closing_cash_counted,
      difference = EXCLUDED.difference,
      notes = EXCLUDED.notes,
      created_by = EXCLUDED.created_by;
  END LOOP;
  
  v_step := 'generate_financial_summaries';
  -- Generate financial summaries
  BEGIN
    PERFORM public.generate_jornada_financial_summaries(p_jornada_id, v_user_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Error generating financial summaries: ' || SQLERRM, 
      'failing_step', v_step,
      'sql_error', SQLERRM,
      'sql_state', SQLSTATE
    );
  END;
  
  v_step := 'update_jornada_status';
  -- Update jornada to closed
  UPDATE public.jornadas
  SET estado = 'cerrada',
      hora_cierre = TO_CHAR(NOW(), 'HH24:MI')::TIME,
      updated_at = NOW()
  WHERE id = p_jornada_id;
  
  v_step := 'log_audit';
  -- Log the closure
  INSERT INTO public.jornada_audit_log (
    jornada_id,
    venue_id,
    actor_user_id,
    actor_source,
    action,
    meta
  ) VALUES (
    p_jornada_id,
    v_venue_id,
    v_user_id,
    'ui',
    'closed',
    jsonb_build_object(
      'closed_at', NOW(),
      'cash_closings_count', jsonb_array_length(p_cash_closings)
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'jornada_id', p_jornada_id,
    'status', 'cerrada'
  );

EXCEPTION WHEN OTHERS THEN
  -- Catch any unexpected error and return structured info
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'failing_step', v_step,
    'sql_state', SQLSTATE
  );
END;
$$;

-- ==========================================
-- C) Ensure expenses.payment_method defaults to 'cash' 
-- ==========================================

-- Check if payment_method column has a default, if not add one
DO $$
BEGIN
  -- Set default for payment_method on expenses if not already set
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'expenses' 
    AND column_name = 'payment_method'
    AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.expenses ALTER COLUMN payment_method SET DEFAULT 'cash';
  END IF;
END
$$;

-- Backfill any NULL payment_method in expenses to 'cash'
UPDATE public.expenses SET payment_method = 'cash' WHERE payment_method IS NULL;