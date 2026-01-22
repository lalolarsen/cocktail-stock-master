-- Add payment_method and pos_id to expenses table
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS pos_id uuid REFERENCES public.pos_terminals(id);

-- Drop existing jornada_financial_summary and recreate with new structure
DROP TABLE IF EXISTS public.jornada_financial_summary CASCADE;

CREATE TABLE public.jornada_financial_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  jornada_id uuid NOT NULL REFERENCES public.jornadas(id),
  pos_id uuid REFERENCES public.pos_terminals(id), -- NULL = overall summary
  
  -- Sales breakdown
  gross_sales_total numeric NOT NULL DEFAULT 0,
  sales_by_payment jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"cash": 1000, "card": 500, "transfer": 200}
  transactions_count integer NOT NULL DEFAULT 0,
  cancelled_sales_total numeric NOT NULL DEFAULT 0,
  cancelled_transactions_count integer NOT NULL DEFAULT 0,
  
  -- Net sales (gross - cancelled)
  net_sales_total numeric NOT NULL DEFAULT 0,
  
  -- Expenses breakdown
  expenses_total numeric NOT NULL DEFAULT 0,
  expenses_by_type jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"operacional": 500, "no_operacional": 100}
  
  -- Cash reconciliation (for per-POS rows)
  opening_cash numeric DEFAULT 0,
  cash_sales numeric DEFAULT 0,
  cash_expenses numeric DEFAULT 0,
  expected_cash numeric DEFAULT 0,
  counted_cash numeric DEFAULT 0,
  cash_difference numeric DEFAULT 0,
  
  -- P&L result
  net_operational_result numeric NOT NULL DEFAULT 0, -- net_sales - expenses
  
  -- Metadata
  closed_by uuid NOT NULL REFERENCES public.profiles(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one summary per jornada per POS (or overall)
  CONSTRAINT unique_jornada_pos_summary UNIQUE (jornada_id, pos_id)
);

-- Enable RLS
ALTER TABLE public.jornada_financial_summary ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read summaries for their venue"
  ON public.jornada_financial_summary FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert summaries for their venue"
  ON public.jornada_financial_summary FOR INSERT
  WITH CHECK (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

-- Function to generate financial summaries on jornada close
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
    SELECT 
      COALESCE(SUM(CASE WHEN is_cancelled = false THEN total_amount ELSE 0 END), 0) as gross_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = true THEN total_amount ELSE 0 END), 0) as cancelled_sales,
      COUNT(CASE WHEN is_cancelled = false THEN 1 END) as tx_count,
      COUNT(CASE WHEN is_cancelled = true THEN 1 END) as cancelled_count,
      COALESCE(SUM(CASE WHEN is_cancelled = false AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN is_cancelled = false AND payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
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
      
      -- Insert per-POS summary
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
        jsonb_build_object('cash', v_sales_data.cash_sales, 'card', v_sales_data.card_sales, 'transfer', v_sales_data.transfer_sales),
        v_sales_data.tx_count,
        v_sales_data.cancelled_sales,
        v_sales_data.cancelled_count,
        v_sales_data.gross_sales - v_sales_data.cancelled_sales,
        v_expenses_data.total_expenses,
        jsonb_build_object('operacional', v_expenses_data.operacional, 'no_operacional', v_expenses_data.no_operacional),
        v_opening, v_cash_in, v_cash_out, v_expected, v_counted, v_counted - v_expected,
        (v_sales_data.gross_sales - v_sales_data.cancelled_sales) - v_expenses_data.total_expenses,
        p_closed_by
      );
      
      -- Accumulate for overall summary
      v_overall_gross := v_overall_gross + v_sales_data.gross_sales;
      v_overall_cancelled := v_overall_cancelled + v_sales_data.cancelled_sales;
      v_overall_transactions := v_overall_transactions + v_sales_data.tx_count;
      v_overall_cancelled_count := v_overall_cancelled_count + v_sales_data.cancelled_count;
      v_overall_expenses := v_overall_expenses + v_expenses_data.total_expenses;
      v_overall_opening_cash := v_overall_opening_cash + v_opening;
      v_overall_cash_sales := v_overall_cash_sales + v_cash_in;
      v_overall_cash_expenses := v_overall_cash_expenses + v_cash_out;
      v_overall_counted_cash := v_overall_counted_cash + v_counted;
      
      -- Accumulate sales by payment
      v_overall_sales_by_payment := jsonb_build_object(
        'cash', COALESCE((v_overall_sales_by_payment->>'cash')::numeric, 0) + v_sales_data.cash_sales,
        'card', COALESCE((v_overall_sales_by_payment->>'card')::numeric, 0) + v_sales_data.card_sales,
        'transfer', COALESCE((v_overall_sales_by_payment->>'transfer')::numeric, 0) + v_sales_data.transfer_sales
      );
      
      -- Accumulate expenses by type
      v_overall_expenses_by_type := jsonb_build_object(
        'operacional', COALESCE((v_overall_expenses_by_type->>'operacional')::numeric, 0) + v_expenses_data.operacional,
        'no_operacional', COALESCE((v_overall_expenses_by_type->>'no_operacional')::numeric, 0) + v_expenses_data.no_operacional
      );
    END;
  END LOOP;
  
  -- Also add expenses not linked to a specific POS
  SELECT 
    COALESCE(SUM(amount), 0) as total_expenses,
    COALESCE(SUM(CASE WHEN expense_type = 'operacional' THEN amount ELSE 0 END), 0) as operacional,
    COALESCE(SUM(CASE WHEN expense_type = 'no_operacional' THEN amount ELSE 0 END), 0) as no_operacional
  INTO v_expenses_data
  FROM public.expenses
  WHERE jornada_id = p_jornada_id AND pos_id IS NULL;
  
  v_overall_expenses := v_overall_expenses + v_expenses_data.total_expenses;
  v_overall_expenses_by_type := jsonb_build_object(
    'operacional', COALESCE((v_overall_expenses_by_type->>'operacional')::numeric, 0) + v_expenses_data.operacional,
    'no_operacional', COALESCE((v_overall_expenses_by_type->>'no_operacional')::numeric, 0) + v_expenses_data.no_operacional
  );
  
  -- Insert overall summary (pos_id = NULL)
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
    v_overall_opening_cash, v_overall_cash_sales, v_overall_cash_expenses,
    v_overall_opening_cash + v_overall_cash_sales - v_overall_cash_expenses,
    v_overall_counted_cash,
    v_overall_counted_cash - (v_overall_opening_cash + v_overall_cash_sales - v_overall_cash_expenses),
    (v_overall_gross - v_overall_cancelled) - v_overall_expenses,
    p_closed_by
  );
END;
$$;

-- Update close_jornada_manual to call generate_jornada_financial_summaries
CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id UUID,
  p_cash_closings JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_jornada RECORD;
  v_pos_entry JSONB;
  v_opening_cash NUMERIC;
  v_cash_sales NUMERIC;
  v_expected_cash NUMERIC;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get jornada
  SELECT * INTO v_jornada FROM public.jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada');
  END IF;
  
  IF v_jornada.estado != 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está abierta');
  END IF;
  
  v_venue_id := v_jornada.venue_id;
  
  -- Process cash closings for each POS
  FOR v_pos_entry IN SELECT * FROM jsonb_array_elements(p_cash_closings)
  LOOP
    -- Get opening cash for this POS
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM public.jornada_cash_openings
    WHERE jornada_id = p_jornada_id
    AND pos_id = (v_pos_entry->>'pos_id')::UUID;
    
    -- Get cash sales for this POS
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM public.sales
    WHERE jornada_id = p_jornada_id
    AND pos_id = (v_pos_entry->>'pos_id')::UUID
    AND payment_method = 'cash'
    AND is_cancelled = false;
    
    v_expected_cash := COALESCE(v_opening_cash, 0) + v_cash_sales;
    
    -- Insert or update cash closing
    INSERT INTO public.jornada_cash_closings (
      jornada_id,
      pos_id,
      opening_cash_amount,
      cash_sales_total,
      expected_cash,
      closing_cash_counted,
      difference,
      notes,
      venue_id,
      created_by
    ) VALUES (
      p_jornada_id,
      (v_pos_entry->>'pos_id')::UUID,
      COALESCE(v_opening_cash, 0),
      v_cash_sales,
      v_expected_cash,
      COALESCE((v_pos_entry->>'closing_cash_counted')::NUMERIC, 0),
      COALESCE((v_pos_entry->>'closing_cash_counted')::NUMERIC, 0) - v_expected_cash,
      v_pos_entry->>'notes',
      v_venue_id,
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
  
  -- Close the jornada
  UPDATE public.jornadas
  SET 
    estado = 'cerrada',
    hora_cierre = now(),
    updated_at = now()
  WHERE id = p_jornada_id;
  
  -- Generate financial summaries (per-POS + overall)
  PERFORM public.generate_jornada_financial_summaries(p_jornada_id, v_user_id);
  
  -- Log the action
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
    jsonb_build_object('cash_closings_count', jsonb_array_length(p_cash_closings))
  );
  
  RETURN jsonb_build_object('success', true, 'jornada_id', p_jornada_id);
END;
$$;