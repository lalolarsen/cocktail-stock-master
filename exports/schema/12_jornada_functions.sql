-- ============================================
-- DiStock Database Schema Export
-- Part 12: Jornada Management Functions
-- ============================================

-- ============================================
-- OPEN JORNADA MANUAL
-- ============================================

CREATE OR REPLACE FUNCTION public.open_jornada_manual(p_cash_amounts JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_existing_open UUID;
  v_jornada_id UUID;
  v_week_start DATE;
  v_today DATE;
  v_current_time TEXT;
  v_last_num INTEGER;
  v_pos_entry JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;
  
  SELECT venue_id INTO v_venue_id FROM profiles WHERE id = v_user_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User has no venue assigned');
  END IF;
  
  -- Check for existing open jornada
  SELECT id INTO v_existing_open
  FROM jornadas
  WHERE venue_id = v_venue_id AND estado = 'activa'
  LIMIT 1;
  
  IF v_existing_open IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada activa', 'jornada_id', v_existing_open);
  END IF;
  
  v_today := CURRENT_DATE;
  v_current_time := TO_CHAR(NOW(), 'HH24:MI');
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  
  SELECT COALESCE(MAX(numero_jornada), 0) INTO v_last_num
  FROM jornadas
  WHERE venue_id = v_venue_id;
  
  INSERT INTO jornadas (numero_jornada, semana_inicio, fecha, hora_apertura, estado, venue_id)
  VALUES (v_last_num + 1, v_week_start, v_today, v_current_time::TIME, 'activa', v_venue_id)
  RETURNING id INTO v_jornada_id;
  
  -- Insert cash openings
  IF jsonb_array_length(p_cash_amounts) > 0 THEN
    FOR v_pos_entry IN SELECT * FROM jsonb_array_elements(p_cash_amounts)
    LOOP
      INSERT INTO jornada_cash_openings (jornada_id, pos_id, opening_cash_amount, venue_id, created_by)
      VALUES (v_jornada_id, (v_pos_entry->>'pos_id')::UUID, COALESCE((v_pos_entry->>'amount')::NUMERIC, 0), v_venue_id, v_user_id);
    END LOOP;
  END IF;
  
  -- Log action
  INSERT INTO jornada_audit_log (jornada_id, venue_id, actor_user_id, actor_source, action, meta)
  VALUES (v_jornada_id, v_venue_id, v_user_id, 'ui', 'opened', jsonb_build_object('opened_at', NOW(), 'cash_amounts', p_cash_amounts));
  
  RETURN jsonb_build_object('success', true, 'jornada_id', v_jornada_id, 'numero_jornada', v_last_num + 1);
END;
$function$;

-- ============================================
-- CLOSE JORNADA MANUAL
-- ============================================

CREATE OR REPLACE FUNCTION public.close_jornada_manual(p_jornada_id UUID, p_cash_closings JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_jornada RECORD;
  v_closing JSONB;
  v_opening_cash NUMERIC;
  v_cash_sales NUMERIC;
  v_ticket_cash_sales NUMERIC;
  v_total_cash_sales NUMERIC;
  v_cash_expenses NUMERIC;
  v_expected_cash NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;
  
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada not found');
  END IF;
  
  IF v_jornada.estado != 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada is not active', 'current_status', v_jornada.estado);
  END IF;
  
  v_venue_id := v_jornada.venue_id;
  
  -- Process cash closings
  FOR v_closing IN SELECT * FROM jsonb_array_elements(p_cash_closings)
  LOOP
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = (v_closing->>'pos_id')::UUID;
    
    -- Alcohol cash sales
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM sales
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::UUID 
      AND payment_method = 'cash'
      AND (is_cancelled = false OR is_cancelled IS NULL);
    
    -- Ticket cash sales
    SELECT COALESCE(SUM(total), 0) INTO v_ticket_cash_sales
    FROM ticket_sales
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::UUID 
      AND payment_method = 'cash'
      AND payment_status = 'paid';
    
    v_total_cash_sales := COALESCE(v_cash_sales, 0) + COALESCE(v_ticket_cash_sales, 0);
    
    -- Cash expenses
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM expenses
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::UUID 
      AND payment_method = 'cash';
    
    v_expected_cash := COALESCE(v_opening_cash, 0) + v_total_cash_sales - COALESCE(v_cash_expenses, 0);
    
    INSERT INTO jornada_cash_closings (
      venue_id, jornada_id, pos_id, opening_cash_amount, cash_sales_total,
      expected_cash, closing_cash_counted, difference, notes, created_by
    ) VALUES (
      v_venue_id, p_jornada_id, (v_closing->>'pos_id')::UUID,
      COALESCE(v_opening_cash, 0), v_total_cash_sales, v_expected_cash,
      COALESCE((v_closing->>'closing_cash_counted')::NUMERIC, 0),
      COALESCE((v_closing->>'closing_cash_counted')::NUMERIC, 0) - v_expected_cash,
      v_closing->>'notes', v_user_id
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
  
  -- Generate financial summaries
  PERFORM generate_jornada_financial_summaries(p_jornada_id, v_user_id);
  
  -- Update jornada status
  UPDATE jornadas
  SET estado = 'cerrada', hora_cierre = TO_CHAR(NOW(), 'HH24:MI')::TIME, updated_at = NOW()
  WHERE id = p_jornada_id;
  
  -- Log action
  INSERT INTO jornada_audit_log (jornada_id, venue_id, actor_user_id, actor_source, action, meta)
  VALUES (p_jornada_id, v_venue_id, v_user_id, 'ui', 'closed', jsonb_build_object('closed_at', NOW()));
  
  RETURN jsonb_build_object('success', true, 'jornada_id', p_jornada_id, 'status', 'cerrada');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ============================================
-- GENERATE JORNADA FINANCIAL SUMMARIES
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_jornada_financial_summaries(p_jornada_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada jornadas%ROWTYPE;
  v_pos RECORD;
  v_gross_sales NUMERIC;
  v_net_sales NUMERIC;
  v_cancelled_sales NUMERIC;
  v_tx_count INTEGER;
  v_cancelled_tx_count INTEGER;
  v_expenses_total NUMERIC;
  v_sales_by_payment JSONB;
  v_expenses_by_type JSONB;
  v_cogs NUMERIC;
  v_opening_cash NUMERIC;
  v_cash_sales NUMERIC;
  v_cash_expenses NUMERIC;
  v_counted_cash NUMERIC;
BEGIN
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jornada not found';
  END IF;
  
  -- Generate summary for each POS that had activity
  FOR v_pos IN
    SELECT DISTINCT pos_id FROM (
      SELECT pos_id FROM sales WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL
      UNION
      SELECT pos_id FROM ticket_sales WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL
      UNION
      SELECT pos_id FROM expenses WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL
    ) all_pos
  LOOP
    -- Calculate sales metrics
    SELECT 
      COALESCE(SUM(CASE WHEN is_cancelled = false OR is_cancelled IS NULL THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN is_cancelled = true THEN total_amount ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE is_cancelled = false OR is_cancelled IS NULL),
      COUNT(*) FILTER (WHERE is_cancelled = true)
    INTO v_gross_sales, v_cancelled_sales, v_tx_count, v_cancelled_tx_count
    FROM sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id;
    
    -- Add ticket sales
    SELECT 
      v_gross_sales + COALESCE(SUM(total), 0),
      v_tx_count + COUNT(*)
    INTO v_gross_sales, v_tx_count
    FROM ticket_sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_status = 'paid';
    
    v_net_sales := v_gross_sales - v_cancelled_sales;
    
    -- Calculate expenses
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses_total
    FROM expenses
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id;
    
    -- Get cash opening
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id;
    
    -- Get cash sales
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_method = 'cash'
      AND (is_cancelled = false OR is_cancelled IS NULL);
    
    -- Add ticket cash sales
    SELECT v_cash_sales + COALESCE(SUM(total), 0) INTO v_cash_sales
    FROM ticket_sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_method = 'cash' AND payment_status = 'paid';
    
    -- Get cash expenses
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM expenses
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_method = 'cash';
    
    -- Get counted cash from closing
    SELECT COALESCE(closing_cash_counted, 0) INTO v_counted_cash
    FROM jornada_cash_closings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id;
    
    -- Insert summary
    INSERT INTO jornada_financial_summary (
      venue_id, jornada_id, pos_id,
      gross_sales_total, net_sales_total, cancelled_sales_total,
      transactions_count, cancelled_transactions_count,
      expenses_total, 
      opening_cash, cash_sales, cash_expenses, expected_cash, counted_cash, cash_difference,
      closed_by, closed_at
    ) VALUES (
      v_jornada.venue_id, p_jornada_id, v_pos.pos_id,
      v_gross_sales, v_net_sales, v_cancelled_sales,
      v_tx_count, v_cancelled_tx_count,
      v_expenses_total,
      COALESCE(v_opening_cash, 0), v_cash_sales, v_cash_expenses,
      COALESCE(v_opening_cash, 0) + v_cash_sales - v_cash_expenses,
      COALESCE(v_counted_cash, 0),
      COALESCE(v_counted_cash, 0) - (COALESCE(v_opening_cash, 0) + v_cash_sales - v_cash_expenses),
      p_user_id, NOW()
    );
  END LOOP;
END;
$function$;

-- ============================================
-- CHECK SINGLE OPEN JORNADA (Trigger)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_single_open_jornada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_count INTEGER;
BEGIN
  IF NEW.estado = 'activa' THEN
    SELECT COUNT(*) INTO existing_count
    FROM jornadas
    WHERE estado = 'activa'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND venue_id IS NOT DISTINCT FROM NEW.venue_id;
    
    IF existing_count > 0 THEN
      RAISE EXCEPTION 'Ya existe una jornada abierta para este venue. Ciérrela antes de abrir una nueva.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- ============================================
-- CHECK JORNADA NOT CLOSED (Trigger)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_jornada_not_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_jornada_estado TEXT;
BEGIN
  IF NEW.jornada_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT estado INTO v_jornada_estado
  FROM jornadas
  WHERE id = NEW.jornada_id;

  IF v_jornada_estado = 'cerrada' THEN
    RAISE EXCEPTION 'No se pueden agregar registros a una jornada cerrada';
  END IF;

  RETURN NEW;
END;
$function$;
