-- Add token metrics to jornada_financial_summary for complete operational reporting
-- This tracks QR token lifecycle per jornada (important for QR redemption compliance)

-- Step 1: Add token metrics columns
ALTER TABLE public.jornada_financial_summary
ADD COLUMN IF NOT EXISTS tokens_issued_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_redeemed_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_pending_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_expired_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_cancelled_count integer DEFAULT 0;

-- Create index for token analytics
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_jornada_status ON public.pickup_tokens(jornada_id, status);

-- Step 2: Update generate_jornada_financial_summaries to include token metrics
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
  v_token_data record;
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
  -- Token totals
  v_total_tokens_issued int := 0;
  v_total_tokens_redeemed int := 0;
  v_total_tokens_pending int := 0;
  v_total_tokens_expired int := 0;
  v_total_tokens_cancelled int := 0;
BEGIN
  -- Get jornada info
  SELECT * INTO v_jornada FROM public.jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RAISE EXCEPTION 'Jornada not found: %', p_jornada_id;
  END IF;
  v_venue_id := v_jornada.venue_id;

  -- Delete existing summaries for this jornada (clean slate)
  DELETE FROM public.jornada_financial_summary WHERE jornada_id = p_jornada_id;

  -- Calculate overall token metrics first (jornada-wide)
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('pending', 'redeemed', 'expired', 'cancelled')) as total_issued,
    COUNT(*) FILTER (WHERE status = 'redeemed') as redeemed,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'expired') as expired,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
  INTO v_token_data
  FROM public.pickup_tokens
  WHERE jornada_id = p_jornada_id;

  v_total_tokens_issued := COALESCE(v_token_data.total_issued, 0);
  v_total_tokens_redeemed := COALESCE(v_token_data.redeemed, 0);
  v_total_tokens_pending := COALESCE(v_token_data.pending, 0);
  v_total_tokens_expired := COALESCE(v_token_data.expired, 0);
  v_total_tokens_cancelled := COALESCE(v_token_data.cancelled, 0);

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

    -- Get TICKET sales for this POS
    SELECT 
      COALESCE(SUM(total), 0) as gross_sales,
      0 as cancelled_sales,
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

    -- Per-POS token metrics (tokens redeemed at this bar location)
    -- Note: We track where tokens were redeemed (bar_location_id) not where they were issued
    DECLARE
      v_pos_tokens_redeemed int := 0;
    BEGIN
      SELECT COUNT(*) INTO v_pos_tokens_redeemed
      FROM public.pickup_tokens
      WHERE jornada_id = p_jornada_id 
        AND bar_location_id = (SELECT location_id FROM pos_terminals WHERE id = v_pos.id)
        AND status = 'redeemed';

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
          cash_difference,
          tokens_issued_count,
          tokens_redeemed_count,
          tokens_pending_count,
          tokens_expired_count,
          tokens_cancelled_count
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
          COALESCE(v_cash_closing.difference, 0),
          0, -- tokens_issued is jornada-wide, not per-POS
          v_pos_tokens_redeemed, -- tokens redeemed at this location
          0, -- pending is jornada-wide
          0, -- expired is jornada-wide
          0  -- cancelled is jornada-wide
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
    END;
  END LOOP;

  -- Insert overall summary (pos_id = NULL) with token metrics
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
    cash_difference,
    tokens_issued_count,
    tokens_redeemed_count,
    tokens_pending_count,
    tokens_expired_count,
    tokens_cancelled_count
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
    v_total_expected_cash - v_total_counted_cash,
    v_total_tokens_issued,
    v_total_tokens_redeemed,
    v_total_tokens_pending,
    v_total_tokens_expired,
    v_total_tokens_cancelled
  );
END;
$$;

-- Document the function
COMMENT ON FUNCTION generate_jornada_financial_summaries(uuid, uuid) IS 
'Generates complete Estado de Resultado Operativo per jornada.
Includes:
- Per-POS and overall financial summaries
- Alcohol + ticket sales combined
- Token lifecycle metrics (issued/redeemed/pending/expired/cancelled)
- Cash reconciliation data';