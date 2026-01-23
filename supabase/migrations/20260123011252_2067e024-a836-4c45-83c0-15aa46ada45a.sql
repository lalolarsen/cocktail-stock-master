-- First drop the existing function with the old parameter name
DROP FUNCTION IF EXISTS public.open_jornada_manual(jsonb);

-- ==========================================
-- FIX 1: open_jornada_manual - DATE type comparisons
-- ==========================================
CREATE OR REPLACE FUNCTION public.open_jornada_manual(
  p_cash_amounts JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_existing_open UUID;
  v_jornada_id UUID;
  v_week_start DATE;  -- Changed from TEXT to DATE
  v_today DATE;       -- Changed from TEXT to DATE
  v_current_time TEXT;
  v_last_num INTEGER;
  v_pos_entry JSONB;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;
  
  -- Get venue_id from profile
  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User has no venue assigned');
  END IF;
  
  -- Check if there's already an open jornada for this venue
  SELECT id INTO v_existing_open
  FROM public.jornadas
  WHERE venue_id = v_venue_id AND estado = 'activa'
  LIMIT 1;
  
  IF v_existing_open IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada activa', 'jornada_id', v_existing_open);
  END IF;
  
  -- Calculate dates using proper DATE types
  v_today := CURRENT_DATE;
  v_current_time := TO_CHAR(NOW(), 'HH24:MI');
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  
  -- Get next jornada number for this week (now comparing DATE = DATE)
  SELECT COALESCE(MAX(numero_jornada), 0) INTO v_last_num
  FROM public.jornadas
  WHERE semana_inicio = v_week_start;
  
  -- Create jornada as OPEN
  INSERT INTO public.jornadas (
    numero_jornada,
    semana_inicio,
    fecha,
    hora_apertura,
    estado,
    venue_id
  ) VALUES (
    v_last_num + 1,
    v_week_start,
    v_today,
    v_current_time::TIME,
    'activa',
    v_venue_id
  ) RETURNING id INTO v_jornada_id;
  
  -- Insert cash opening records for each POS
  IF jsonb_array_length(p_cash_amounts) > 0 THEN
    FOR v_pos_entry IN SELECT * FROM jsonb_array_elements(p_cash_amounts)
    LOOP
      INSERT INTO public.jornada_cash_openings (
        jornada_id,
        pos_id,
        opening_cash_amount,
        venue_id,
        created_by
      ) VALUES (
        v_jornada_id,
        (v_pos_entry->>'pos_id')::UUID,
        COALESCE((v_pos_entry->>'amount')::NUMERIC, 0),
        v_venue_id,
        v_user_id
      );
    END LOOP;
  END IF;
  
  -- Log the action
  INSERT INTO public.jornada_audit_log (
    jornada_id,
    venue_id,
    actor_user_id,
    actor_source,
    action,
    meta
  ) VALUES (
    v_jornada_id,
    v_venue_id,
    v_user_id,
    'ui',
    'opened',
    jsonb_build_object(
      'opened_at', NOW(),
      'cash_amounts', p_cash_amounts
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'jornada_id', v_jornada_id,
    'numero_jornada', v_last_num + 1
  );
END;
$$;

-- ==========================================
-- FIX 2: generate_jornada_financial_summaries - Use valid enum values
-- ==========================================
CREATE OR REPLACE FUNCTION public.generate_jornada_financial_summaries(
  p_jornada_id uuid,
  p_closed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_pos record;
  v_sales_data record;
  v_expenses_data record;
  v_cash_opening record;
  v_cash_closing record;
  v_overall_gross numeric := 0;
  v_overall_cancelled numeric := 0;
  v_overall_transactions int := 0;
  v_overall_cancelled_count int := 0;
  v_overall_expenses numeric := 0;
  v_overall_sales_by_payment jsonb := '{}'::jsonb;
  v_overall_expenses_by_type jsonb := '{}'::jsonb;
  v_overall_opening_cash numeric := 0;
  v_overall_cash_sales numeric := 0;
  v_overall_cash_expenses numeric := 0;
  v_overall_counted_cash numeric := 0;
BEGIN
  -- Get venue_id from jornada
  SELECT venue_id INTO v_venue_id FROM public.jornadas WHERE id = p_jornada_id;
  
  -- Delete any existing summaries for this jornada (idempotent)
  DELETE FROM public.jornada_financial_summary WHERE jornada_id = p_jornada_id;
  
  -- Generate per-POS summaries
  FOR v_pos IN SELECT id, name FROM public.pos_terminals WHERE is_active = true
  LOOP
    -- Get sales data for this POS
    -- Fixed: Using valid enum values (debit, credit) instead of 'card'
    SELECT 
      COALESCE(SUM(CASE WHEN is_cancelled = false THEN total_amount ELSE 0 END), 0) as gross_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = true THEN total_amount ELSE 0 END), 0) as cancelled_sales,
      COUNT(CASE WHEN is_cancelled = false THEN 1 END) as tx_count,
      COUNT(CASE WHEN is_cancelled = true THEN 1 END) as cancelled_count,
      COALESCE(SUM(CASE WHEN is_cancelled = false AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = false AND payment_method = 'debit' THEN total_amount ELSE 0 END), 0) as debit_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = false AND payment_method = 'credit' THEN total_amount ELSE 0 END), 0) as credit_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = false AND payment_method = 'transfer' THEN total_amount ELSE 0 END), 0) as transfer_sales
    INTO v_sales_data
    FROM public.sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;
    
    -- Get expenses for this POS (if any)
    SELECT 
      COALESCE(SUM(amount), 0) as total_expenses,
      COALESCE(SUM(CASE WHEN expense_type = 'operacional' THEN amount ELSE 0 END), 0) as operacional,
      COALESCE(SUM(CASE WHEN expense_type = 'no_operacional' THEN amount ELSE 0 END), 0) as no_operacional,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_expenses
    INTO v_expenses_data
    FROM public.expenses
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;
    
    -- Get cash opening for this POS
    SELECT opening_cash_amount INTO v_cash_opening
    FROM public.jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;
    
    -- Get cash closing for this POS
    SELECT closing_cash_counted INTO v_cash_closing
    FROM public.jornada_cash_closings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;
    
    -- Calculate expected cash (opening + cash sales - cash expenses)
    DECLARE
      v_opening numeric := COALESCE(v_cash_opening.opening_cash_amount, 0);
      v_cash_in numeric := COALESCE(v_sales_data.cash_sales, 0);
      v_cash_out numeric := COALESCE(v_expenses_data.cash_expenses, 0);
      v_expected numeric;
      v_counted numeric := COALESCE(v_cash_closing.closing_cash_counted, 0);
    BEGIN
      v_expected := v_opening + v_cash_in - v_cash_out;
      
      -- Insert per-POS summary with correct payment method breakdown
      INSERT INTO public.jornada_financial_summary (
        venue_id, jornada_id, pos_id,
        gross_sales_total, sales_by_payment, transactions_count,
        cancelled_sales_total, cancelled_transactions_count,
        net_sales_total,
        expenses_total, expenses_by_type,
        opening_cash, cash_sales, cash_expenses, expected_cash, counted_cash, cash_difference,
        net_operational_result,
        closed_by
      ) VALUES (
        v_venue_id, p_jornada_id, v_pos.id,
        v_sales_data.gross_sales,
        jsonb_build_object(
          'cash', v_sales_data.cash_sales, 
          'debit', v_sales_data.debit_sales, 
          'credit', v_sales_data.credit_sales, 
          'transfer', v_sales_data.transfer_sales
        ),
        v_sales_data.tx_count,
        v_sales_data.cancelled_sales,
        v_sales_data.cancelled_count,
        v_sales_data.gross_sales - v_sales_data.cancelled_sales,
        v_expenses_data.total_expenses,
        jsonb_build_object('operacional', v_expenses_data.operacional, 'no_operacional', v_expenses_data.no_operacional),
        v_opening,
        v_sales_data.cash_sales,
        v_expenses_data.cash_expenses,
        v_expected,
        v_counted,
        v_counted - v_expected,
        (v_sales_data.gross_sales - v_sales_data.cancelled_sales) - v_expenses_data.total_expenses,
        p_closed_by
      );
      
      -- Accumulate overall totals
      v_overall_gross := v_overall_gross + v_sales_data.gross_sales;
      v_overall_cancelled := v_overall_cancelled + v_sales_data.cancelled_sales;
      v_overall_transactions := v_overall_transactions + v_sales_data.tx_count;
      v_overall_cancelled_count := v_overall_cancelled_count + v_sales_data.cancelled_count;
      v_overall_expenses := v_overall_expenses + v_expenses_data.total_expenses;
      v_overall_opening_cash := v_overall_opening_cash + v_opening;
      v_overall_cash_sales := v_overall_cash_sales + v_sales_data.cash_sales;
      v_overall_cash_expenses := v_overall_cash_expenses + v_expenses_data.cash_expenses;
      v_overall_counted_cash := v_overall_counted_cash + v_counted;
      
      -- Merge payment method totals
      v_overall_sales_by_payment := jsonb_build_object(
        'cash', COALESCE((v_overall_sales_by_payment->>'cash')::numeric, 0) + v_sales_data.cash_sales,
        'debit', COALESCE((v_overall_sales_by_payment->>'debit')::numeric, 0) + v_sales_data.debit_sales,
        'credit', COALESCE((v_overall_sales_by_payment->>'credit')::numeric, 0) + v_sales_data.credit_sales,
        'transfer', COALESCE((v_overall_sales_by_payment->>'transfer')::numeric, 0) + v_sales_data.transfer_sales
      );
      
      -- Merge expense type totals
      v_overall_expenses_by_type := jsonb_build_object(
        'operacional', COALESCE((v_overall_expenses_by_type->>'operacional')::numeric, 0) + v_expenses_data.operacional,
        'no_operacional', COALESCE((v_overall_expenses_by_type->>'no_operacional')::numeric, 0) + v_expenses_data.no_operacional
      );
    END;
  END LOOP;
  
  -- Insert overall summary (no pos_id)
  DECLARE
    v_overall_expected numeric := v_overall_opening_cash + v_overall_cash_sales - v_overall_cash_expenses;
  BEGIN
    INSERT INTO public.jornada_financial_summary (
      venue_id, jornada_id, pos_id,
      gross_sales_total, sales_by_payment, transactions_count,
      cancelled_sales_total, cancelled_transactions_count,
      net_sales_total,
      expenses_total, expenses_by_type,
      opening_cash, cash_sales, cash_expenses, expected_cash, counted_cash, cash_difference,
      net_operational_result,
      closed_by
    ) VALUES (
      v_venue_id, p_jornada_id, NULL,
      v_overall_gross,
      v_overall_sales_by_payment,
      v_overall_transactions,
      v_overall_cancelled,
      v_overall_cancelled_count,
      v_overall_gross - v_overall_cancelled,
      v_overall_expenses,
      v_overall_expenses_by_type,
      v_overall_opening_cash,
      v_overall_cash_sales,
      v_overall_cash_expenses,
      v_overall_expected,
      v_overall_counted_cash,
      v_overall_counted_cash - v_overall_expected,
      (v_overall_gross - v_overall_cancelled) - v_overall_expenses,
      p_closed_by
    );
  END;
END;
$$;