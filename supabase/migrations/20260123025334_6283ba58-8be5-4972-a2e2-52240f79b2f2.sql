-- Jornada v1.5: Include ticket_sales in cash register reconciliation
-- 1) Add pos_id to ticket_sales for per-POS attribution
-- 2) Update create_ticket_sale_with_covers to accept pos_id
-- 3) Update close_jornada_manual to include ticket cash sales
-- 4) Update generate_jornada_financial_summaries to include ticket sales

-- Step 1: Add pos_id to ticket_sales
ALTER TABLE public.ticket_sales
ADD COLUMN IF NOT EXISTS pos_id uuid REFERENCES public.pos_terminals(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_ticket_sales_pos_id ON public.ticket_sales(pos_id);
CREATE INDEX IF NOT EXISTS idx_ticket_sales_jornada_pos ON public.ticket_sales(jornada_id, pos_id);

-- Step 2: Update create_ticket_sale_with_covers to accept pos_id
CREATE OR REPLACE FUNCTION public.create_ticket_sale_with_covers(
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_jornada_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_pos_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_venue_id uuid;
  v_jornada_id uuid;
  v_ticket_sale_id uuid;
  v_ticket_number text;
  v_total numeric := 0;
  v_item jsonb;
  v_ticket_type record;
  v_item_total numeric;
  v_covers_created int := 0;
  v_token_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;

  -- Get venue from user profile or parameter
  IF p_venue_id IS NOT NULL THEN
    v_venue_id := p_venue_id;
  ELSE
    SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  END IF;
  
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No venue associated');
  END IF;

  -- Get active jornada
  IF p_jornada_id IS NOT NULL THEN
    v_jornada_id := p_jornada_id;
  ELSE
    SELECT id INTO v_jornada_id FROM public.jornadas 
    WHERE venue_id = v_venue_id AND estado = 'activa' 
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- Generate ticket number
  SELECT 'T-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 3) AS INTEGER)), 0) + 1)::TEXT, 6, '0')
  INTO v_ticket_number
  FROM public.ticket_sales
  WHERE venue_id = v_venue_id;

  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type FROM public.ticket_types WHERE id = (v_item->>'ticket_type_id')::uuid;
    IF v_ticket_type IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid ticket type: ' || (v_item->>'ticket_type_id'));
    END IF;
    v_item_total := v_ticket_type.price * COALESCE((v_item->>'quantity')::int, 1);
    v_total := v_total + v_item_total;
  END LOOP;

  -- Create ticket sale record WITH pos_id
  INSERT INTO public.ticket_sales (
    venue_id,
    sold_by_worker_id,
    ticket_number,
    total,
    payment_method,
    payment_status,
    jornada_id,
    pos_id
  ) VALUES (
    v_venue_id,
    v_user_id,
    v_ticket_number,
    v_total,
    COALESCE(p_payment_method, 'cash')::payment_method,
    'paid',
    v_jornada_id,
    p_pos_id
  )
  RETURNING id INTO v_ticket_sale_id;

  -- Create sale items and covers
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type FROM public.ticket_types WHERE id = (v_item->>'ticket_type_id')::uuid;
    v_item_total := v_ticket_type.price * COALESCE((v_item->>'quantity')::int, 1);

    INSERT INTO public.ticket_sale_items (
      ticket_sale_id,
      ticket_type_id,
      quantity,
      unit_price,
      line_total
    ) VALUES (
      v_ticket_sale_id,
      v_ticket_type.id,
      COALESCE((v_item->>'quantity')::int, 1),
      v_ticket_type.price,
      v_item_total
    );

    -- If ticket includes cover, create pickup tokens with full metadata
    IF v_ticket_type.includes_cover AND v_ticket_type.cover_cocktail_id IS NOT NULL THEN
      FOR i IN 1..COALESCE((v_item->>'quantity')::int, 1) LOOP
        INSERT INTO public.pickup_tokens (
          sale_id,
          ticket_sale_id,
          venue_id,
          jornada_id,
          status,
          source_type,
          cover_cocktail_id,
          cover_quantity,
          expires_at,
          metadata
        ) VALUES (
          v_ticket_sale_id,
          v_ticket_sale_id,
          v_venue_id,
          v_jornada_id,
          'pending',
          'ticket',
          v_ticket_type.cover_cocktail_id,
          v_ticket_type.cover_quantity,
          now() + interval '12 hours',
          jsonb_build_object(
            'ticket_number', v_ticket_number,
            'ticket_type_name', v_ticket_type.name,
            'cover_quantity', v_ticket_type.cover_quantity
          )
        )
        RETURNING id INTO v_token_id;
        
        v_covers_created := v_covers_created + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_sale_id', v_ticket_sale_id,
    'ticket_number', v_ticket_number,
    'total', v_total,
    'covers_created', v_covers_created,
    'jornada_id', v_jornada_id,
    'pos_id', p_pos_id
  );
END;
$$;

-- Step 3: Update close_jornada_manual to include ticket_sales cash
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
  v_ticket_cash_sales numeric;
  v_total_cash_sales numeric;
  v_cash_expenses numeric;
  v_expected_cash numeric;
  v_step text := 'init';
BEGIN
  v_step := 'get_user';
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user', 'failing_step', v_step);
  END IF;
  
  v_step := 'validate_jornada';
  SELECT * INTO v_jornada FROM public.jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada not found', 'failing_step', v_step);
  END IF;
  
  IF v_jornada.estado != 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada is not active', 'failing_step', v_step, 'current_status', v_jornada.estado);
  END IF;
  
  v_venue_id := v_jornada.venue_id;
  
  v_step := 'process_cash_closings';
  FOR v_closing IN SELECT * FROM jsonb_array_elements(p_cash_closings)
  LOOP
    -- Get opening cash for this POS
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM public.jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = (v_closing->>'pos_id')::uuid;
    
    -- Calculate ALCOHOL cash sales for this POS
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM public.sales
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::uuid 
      AND payment_method = 'cash'
      AND (is_cancelled = false OR is_cancelled IS NULL);
    
    -- Calculate TICKET cash sales for this POS (NEW!)
    SELECT COALESCE(SUM(total), 0) INTO v_ticket_cash_sales
    FROM public.ticket_sales
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::uuid 
      AND payment_method = 'cash'
      AND payment_status = 'paid';
    
    -- Total cash sales = alcohol + tickets
    v_total_cash_sales := COALESCE(v_cash_sales, 0) + COALESCE(v_ticket_cash_sales, 0);
    
    -- Calculate cash expenses for this POS
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM public.expenses
    WHERE jornada_id = p_jornada_id 
      AND pos_id = (v_closing->>'pos_id')::uuid 
      AND payment_method = 'cash';
    
    -- Expected = opening + all cash sales - cash expenses
    v_expected_cash := COALESCE(v_opening_cash, 0) + v_total_cash_sales - COALESCE(v_cash_expenses, 0);
    
    v_step := 'upsert_cash_closing_' || (v_closing->>'pos_id');
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
      v_total_cash_sales, -- Now includes both alcohol + ticket cash sales
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
  UPDATE public.jornadas
  SET estado = 'cerrada',
      hora_cierre = TO_CHAR(NOW(), 'HH24:MI')::TIME,
      updated_at = NOW()
  WHERE id = p_jornada_id;
  
  v_step := 'log_audit';
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
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'failing_step', v_step,
    'sql_state', SQLSTATE
  );
END;
$$;

-- Step 4: Update generate_jornada_financial_summaries to include ticket sales
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
  v_jornada record;
  v_venue_id uuid;
  v_pos record;
  v_sales_data record;
  v_ticket_data record;
  v_expenses_data record;
  v_cash_opening record;
  v_cash_closing record;
  v_total_gross numeric := 0;
  v_total_cancelled numeric := 0;
  v_total_net numeric := 0;
  v_total_expenses numeric := 0;
  v_total_tx_count int := 0;
  v_total_cancelled_count int := 0;
  v_total_cash_sales numeric := 0;
  v_total_card_sales numeric := 0;
  v_total_transfer_sales numeric := 0;
  v_total_opening_cash numeric := 0;
  v_total_counted_cash numeric := 0;
  v_total_expected_cash numeric := 0;
  v_total_cash_expenses numeric := 0;
  v_expenses_by_type jsonb;
  v_sales_by_payment jsonb;
BEGIN
  -- Get jornada info
  SELECT * INTO v_jornada FROM public.jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RAISE EXCEPTION 'Jornada not found: %', p_jornada_id;
  END IF;
  v_venue_id := v_jornada.venue_id;

  -- Delete existing summaries for this jornada (clean slate)
  DELETE FROM public.jornada_financial_summary WHERE jornada_id = p_jornada_id;

  -- Process each cash register POS
  FOR v_pos IN 
    SELECT pt.id, pt.name, pt.pos_type
    FROM public.pos_terminals pt
    WHERE pt.is_active = true AND pt.is_cash_register = true
  LOOP
    -- Get ALCOHOL sales for this POS
    SELECT 
      COALESCE(SUM(CASE WHEN is_cancelled = false OR is_cancelled IS NULL THEN total_amount ELSE 0 END), 0) as gross_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = true THEN total_amount ELSE 0 END), 0) as cancelled_sales,
      COUNT(CASE WHEN is_cancelled = false OR is_cancelled IS NULL THEN 1 END) as tx_count,
      COUNT(CASE WHEN is_cancelled = true THEN 1 END) as cancelled_count,
      COALESCE(SUM(CASE WHEN (is_cancelled = false OR is_cancelled IS NULL) AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN (is_cancelled = false OR is_cancelled IS NULL) AND payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
      COALESCE(SUM(CASE WHEN (is_cancelled = false OR is_cancelled IS NULL) AND payment_method = 'transfer' THEN total_amount ELSE 0 END), 0) as transfer_sales
    INTO v_sales_data
    FROM public.sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;

    -- Get TICKET sales for this POS (NEW!)
    SELECT 
      COALESCE(SUM(total), 0) as gross_sales,
      0 as cancelled_sales, -- ticket_sales doesn't have is_cancelled column yet
      COUNT(*) as tx_count,
      0 as cancelled_count,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as transfer_sales
    INTO v_ticket_data
    FROM public.ticket_sales
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id AND payment_status = 'paid';

    -- Get expenses for this POS
    SELECT 
      COALESCE(SUM(amount), 0) as total,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_expenses,
      jsonb_build_object(
        'operacional', COALESCE(SUM(CASE WHEN expense_type = 'operacional' THEN amount ELSE 0 END), 0),
        'no_operacional', COALESCE(SUM(CASE WHEN expense_type = 'no_operacional' THEN amount ELSE 0 END), 0)
      ) as by_type
    INTO v_expenses_data
    FROM public.expenses
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;

    -- Get cash opening
    SELECT * INTO v_cash_opening
    FROM public.jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;

    -- Get cash closing
    SELECT * INTO v_cash_closing
    FROM public.jornada_cash_closings
    WHERE jornada_id = p_jornada_id AND pos_id = v_pos.id;

    -- Combined totals (alcohol + tickets)
    DECLARE
      v_combined_gross numeric := COALESCE(v_sales_data.gross_sales, 0) + COALESCE(v_ticket_data.gross_sales, 0);
      v_combined_cancelled numeric := COALESCE(v_sales_data.cancelled_sales, 0) + COALESCE(v_ticket_data.cancelled_sales, 0);
      v_combined_net numeric := v_combined_gross - v_combined_cancelled;
      v_combined_tx_count int := COALESCE(v_sales_data.tx_count, 0) + COALESCE(v_ticket_data.tx_count, 0);
      v_combined_cancelled_count int := COALESCE(v_sales_data.cancelled_count, 0) + COALESCE(v_ticket_data.cancelled_count, 0);
      v_combined_cash numeric := COALESCE(v_sales_data.cash_sales, 0) + COALESCE(v_ticket_data.cash_sales, 0);
      v_combined_card numeric := COALESCE(v_sales_data.card_sales, 0) + COALESCE(v_ticket_data.card_sales, 0);
      v_combined_transfer numeric := COALESCE(v_sales_data.transfer_sales, 0) + COALESCE(v_ticket_data.transfer_sales, 0);
    BEGIN
      -- Insert per-POS summary
      INSERT INTO public.jornada_financial_summary (
        venue_id,
        jornada_id,
        pos_id,
        pos_type,
        closed_by,
        closed_at,
        gross_sales_total,
        cancelled_sales_total,
        cancelled_transactions_count,
        net_sales_total,
        transactions_count,
        sales_by_payment,
        expenses_total,
        expenses_by_type,
        net_operational_result,
        opening_cash,
        cash_sales,
        cash_expenses,
        expected_cash,
        counted_cash,
        cash_difference
      ) VALUES (
        v_venue_id,
        p_jornada_id,
        v_pos.id,
        v_pos.pos_type,
        p_closed_by,
        NOW(),
        v_combined_gross,
        v_combined_cancelled,
        v_combined_cancelled_count,
        v_combined_net,
        v_combined_tx_count,
        jsonb_build_object('cash', v_combined_cash, 'card', v_combined_card, 'transfer', v_combined_transfer),
        COALESCE(v_expenses_data.total, 0),
        COALESCE(v_expenses_data.by_type, '{}'::jsonb),
        v_combined_net - COALESCE(v_expenses_data.total, 0),
        COALESCE(v_cash_opening.opening_cash_amount, 0),
        v_combined_cash,
        COALESCE(v_expenses_data.cash_expenses, 0),
        COALESCE(v_cash_closing.expected_cash, 0),
        COALESCE(v_cash_closing.closing_cash_counted, 0),
        COALESCE(v_cash_closing.difference, 0)
      );

      -- Accumulate totals
      v_total_gross := v_total_gross + v_combined_gross;
      v_total_cancelled := v_total_cancelled + v_combined_cancelled;
      v_total_net := v_total_net + v_combined_net;
      v_total_expenses := v_total_expenses + COALESCE(v_expenses_data.total, 0);
      v_total_tx_count := v_total_tx_count + v_combined_tx_count;
      v_total_cancelled_count := v_total_cancelled_count + v_combined_cancelled_count;
      v_total_cash_sales := v_total_cash_sales + v_combined_cash;
      v_total_card_sales := v_total_card_sales + v_combined_card;
      v_total_transfer_sales := v_total_transfer_sales + v_combined_transfer;
      v_total_opening_cash := v_total_opening_cash + COALESCE(v_cash_opening.opening_cash_amount, 0);
      v_total_counted_cash := v_total_counted_cash + COALESCE(v_cash_closing.closing_cash_counted, 0);
      v_total_expected_cash := v_total_expected_cash + COALESCE(v_cash_closing.expected_cash, 0);
      v_total_cash_expenses := v_total_cash_expenses + COALESCE(v_expenses_data.cash_expenses, 0);
    END;
  END LOOP;

  -- Insert overall summary (pos_id = NULL)
  INSERT INTO public.jornada_financial_summary (
    venue_id,
    jornada_id,
    pos_id,
    pos_type,
    closed_by,
    closed_at,
    gross_sales_total,
    cancelled_sales_total,
    cancelled_transactions_count,
    net_sales_total,
    transactions_count,
    sales_by_payment,
    expenses_total,
    expenses_by_type,
    net_operational_result,
    opening_cash,
    cash_sales,
    cash_expenses,
    expected_cash,
    counted_cash,
    cash_difference
  ) VALUES (
    v_venue_id,
    p_jornada_id,
    NULL,
    'overall',
    p_closed_by,
    NOW(),
    v_total_gross,
    v_total_cancelled,
    v_total_cancelled_count,
    v_total_net,
    v_total_tx_count,
    jsonb_build_object('cash', v_total_cash_sales, 'card', v_total_card_sales, 'transfer', v_total_transfer_sales),
    v_total_expenses,
    '{}'::jsonb,
    v_total_net - v_total_expenses,
    v_total_opening_cash,
    v_total_cash_sales,
    v_total_cash_expenses,
    v_total_expected_cash,
    v_total_counted_cash,
    v_total_expected_cash - v_total_counted_cash
  );
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION generate_jornada_financial_summaries(uuid, uuid) IS 
'Generates per-POS and overall financial summaries for a jornada.
Now includes BOTH alcohol sales and ticket sales in calculations.
All cash registers (alcohol_sales + ticket_sales POS types) are processed.';

COMMENT ON FUNCTION close_jornada_manual(uuid, jsonb) IS 
'Atomic transactional close of a jornada.
Includes cash reconciliation for ALL cash registers (alcohol + ticket POS).
Expected cash = opening_cash + alcohol_cash_sales + ticket_cash_sales - cash_expenses';