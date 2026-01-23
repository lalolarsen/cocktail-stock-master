-- Add pos_type column to jornada_financial_summary for aggregation by POS type
ALTER TABLE public.jornada_financial_summary
ADD COLUMN pos_type text DEFAULT NULL;

-- Update unique constraint to include pos_type
ALTER TABLE public.jornada_financial_summary
DROP CONSTRAINT IF EXISTS unique_jornada_pos_summary;

ALTER TABLE public.jornada_financial_summary
ADD CONSTRAINT unique_jornada_pos_type_summary UNIQUE (jornada_id, pos_id, pos_type);

-- Create index for efficient querying by pos_type
CREATE INDEX idx_jornada_financial_summary_pos_type ON public.jornada_financial_summary(jornada_id, pos_type);

-- Recreate the generate_jornada_financial_summaries function to include per-pos_type summaries
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
  v_pos RECORD;
  v_pos_type_rec RECORD;
  v_sales_data RECORD;
  v_expenses_data RECORD;
  v_cash_opening RECORD;
  v_cash_closing RECORD;
  
  -- Overall accumulators
  v_overall_gross numeric := 0;
  v_overall_cancelled numeric := 0;
  v_overall_transactions integer := 0;
  v_overall_cancelled_count integer := 0;
  v_overall_expenses numeric := 0;
  v_overall_opening_cash numeric := 0;
  v_overall_cash_sales numeric := 0;
  v_overall_cash_expenses numeric := 0;
  v_overall_counted_cash numeric := 0;
  v_overall_sales_by_payment jsonb := '{}'::jsonb;
  v_overall_expenses_by_type jsonb := '{}'::jsonb;
  
  -- Per-pos_type accumulators
  v_type_gross numeric;
  v_type_cancelled numeric;
  v_type_transactions integer;
  v_type_cancelled_count integer;
  v_type_expenses numeric;
  v_type_opening_cash numeric;
  v_type_cash_sales numeric;
  v_type_cash_expenses numeric;
  v_type_counted_cash numeric;
  v_type_sales_by_payment jsonb;
  v_type_expenses_by_type jsonb;
BEGIN
  -- Get venue ID from jornada
  SELECT venue_id INTO v_venue_id FROM public.jornadas WHERE id = p_jornada_id;
  
  -- Delete existing summaries for this jornada (in case of re-run)
  DELETE FROM public.jornada_financial_summary WHERE jornada_id = p_jornada_id;
  
  -- Loop through each active POS terminal with cash registers only
  FOR v_pos IN SELECT pt.id, pt.name, pt.pos_type FROM public.pos_terminals pt WHERE pt.is_active = true AND pt.is_cash_register = true
  LOOP
    -- Get sales data for this POS
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
    
    -- Get expenses for this POS
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
    
    -- Calculate expected cash
    DECLARE
      v_opening numeric := COALESCE(v_cash_opening.opening_cash_amount, 0);
      v_cash_in numeric := COALESCE(v_sales_data.cash_sales, 0);
      v_cash_out numeric := COALESCE(v_expenses_data.cash_expenses, 0);
      v_expected numeric;
      v_counted numeric := COALESCE(v_cash_closing.closing_cash_counted, 0);
    BEGIN
      v_expected := v_opening + v_cash_in - v_cash_out;
      
      -- Insert per-POS summary (with pos_type = NULL to indicate this is a per-POS row, not per-type)
      INSERT INTO public.jornada_financial_summary (
        venue_id, jornada_id, pos_id, pos_type,
        gross_sales_total, sales_by_payment, transactions_count,
        cancelled_sales_total, cancelled_transactions_count,
        net_sales_total,
        expenses_total, expenses_by_type,
        opening_cash, cash_sales, cash_expenses, expected_cash, counted_cash, cash_difference,
        net_operational_result,
        closed_by
      ) VALUES (
        v_venue_id, p_jornada_id, v_pos.id, NULL,
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
      
      v_overall_sales_by_payment := jsonb_build_object(
        'cash', COALESCE((v_overall_sales_by_payment->>'cash')::numeric, 0) + v_sales_data.cash_sales,
        'debit', COALESCE((v_overall_sales_by_payment->>'debit')::numeric, 0) + v_sales_data.debit_sales,
        'credit', COALESCE((v_overall_sales_by_payment->>'credit')::numeric, 0) + v_sales_data.credit_sales,
        'transfer', COALESCE((v_overall_sales_by_payment->>'transfer')::numeric, 0) + v_sales_data.transfer_sales
      );
      
      v_overall_expenses_by_type := jsonb_build_object(
        'operacional', COALESCE((v_overall_expenses_by_type->>'operacional')::numeric, 0) + v_expenses_data.operacional,
        'no_operacional', COALESCE((v_overall_expenses_by_type->>'no_operacional')::numeric, 0) + v_expenses_data.no_operacional
      );
    END;
  END LOOP;
  
  -- Generate per-pos_type summaries (aggregate all POS of same type)
  FOR v_pos_type_rec IN SELECT DISTINCT pt.pos_type FROM public.pos_terminals pt WHERE pt.is_active = true AND pt.is_cash_register = true
  LOOP
    -- Reset type accumulators
    v_type_gross := 0;
    v_type_cancelled := 0;
    v_type_transactions := 0;
    v_type_cancelled_count := 0;
    v_type_expenses := 0;
    v_type_opening_cash := 0;
    v_type_cash_sales := 0;
    v_type_cash_expenses := 0;
    v_type_counted_cash := 0;
    v_type_sales_by_payment := '{}'::jsonb;
    v_type_expenses_by_type := '{}'::jsonb;
    
    -- Aggregate from per-POS summaries of this type
    SELECT 
      COALESCE(SUM(gross_sales_total), 0),
      COALESCE(SUM(cancelled_sales_total), 0),
      COALESCE(SUM(transactions_count), 0),
      COALESCE(SUM(cancelled_transactions_count), 0),
      COALESCE(SUM(expenses_total), 0),
      COALESCE(SUM(opening_cash), 0),
      COALESCE(SUM(cash_sales), 0),
      COALESCE(SUM(cash_expenses), 0),
      COALESCE(SUM(counted_cash), 0)
    INTO 
      v_type_gross, v_type_cancelled, v_type_transactions, v_type_cancelled_count,
      v_type_expenses, v_type_opening_cash, v_type_cash_sales, v_type_cash_expenses, v_type_counted_cash
    FROM public.jornada_financial_summary jfs
    JOIN public.pos_terminals pt ON jfs.pos_id = pt.id
    WHERE jfs.jornada_id = p_jornada_id AND pt.pos_type = v_pos_type_rec.pos_type AND jfs.pos_type IS NULL;
    
    -- Aggregate payment methods
    SELECT 
      jsonb_build_object(
        'cash', COALESCE(SUM((sales_by_payment->>'cash')::numeric), 0),
        'debit', COALESCE(SUM((sales_by_payment->>'debit')::numeric), 0),
        'credit', COALESCE(SUM((sales_by_payment->>'credit')::numeric), 0),
        'transfer', COALESCE(SUM((sales_by_payment->>'transfer')::numeric), 0)
      ),
      jsonb_build_object(
        'operacional', COALESCE(SUM((expenses_by_type->>'operacional')::numeric), 0),
        'no_operacional', COALESCE(SUM((expenses_by_type->>'no_operacional')::numeric), 0)
      )
    INTO v_type_sales_by_payment, v_type_expenses_by_type
    FROM public.jornada_financial_summary jfs
    JOIN public.pos_terminals pt ON jfs.pos_id = pt.id
    WHERE jfs.jornada_id = p_jornada_id AND pt.pos_type = v_pos_type_rec.pos_type AND jfs.pos_type IS NULL;
    
    -- Insert per-pos_type summary (pos_id = NULL, pos_type = actual type)
    INSERT INTO public.jornada_financial_summary (
      venue_id, jornada_id, pos_id, pos_type,
      gross_sales_total, sales_by_payment, transactions_count,
      cancelled_sales_total, cancelled_transactions_count,
      net_sales_total,
      expenses_total, expenses_by_type,
      opening_cash, cash_sales, cash_expenses, expected_cash, counted_cash, cash_difference,
      net_operational_result,
      closed_by
    ) VALUES (
      v_venue_id, p_jornada_id, NULL, v_pos_type_rec.pos_type,
      v_type_gross,
      v_type_sales_by_payment,
      v_type_transactions,
      v_type_cancelled,
      v_type_cancelled_count,
      v_type_gross - v_type_cancelled,
      v_type_expenses,
      v_type_expenses_by_type,
      v_type_opening_cash,
      v_type_cash_sales,
      v_type_cash_expenses,
      v_type_opening_cash + v_type_cash_sales - v_type_cash_expenses,
      v_type_counted_cash,
      v_type_counted_cash - (v_type_opening_cash + v_type_cash_sales - v_type_cash_expenses),
      (v_type_gross - v_type_cancelled) - v_type_expenses,
      p_closed_by
    );
  END LOOP;
  
  -- Insert overall summary (pos_id = NULL, pos_type = NULL)
  DECLARE
    v_overall_expected numeric := v_overall_opening_cash + v_overall_cash_sales - v_overall_cash_expenses;
  BEGIN
    INSERT INTO public.jornada_financial_summary (
      venue_id, jornada_id, pos_id, pos_type,
      gross_sales_total, sales_by_payment, transactions_count,
      cancelled_sales_total, cancelled_transactions_count,
      net_sales_total,
      expenses_total, expenses_by_type,
      opening_cash, cash_sales, cash_expenses, expected_cash, counted_cash, cash_difference,
      net_operational_result,
      closed_by
    ) VALUES (
      v_venue_id, p_jornada_id, NULL, NULL,
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