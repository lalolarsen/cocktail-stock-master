
-- P0 FIX Step 2: Migrate data and update functions

-- Migrate existing 'issued' status to 'pending'
UPDATE public.pickup_tokens 
SET status = 'pending'::pickup_token_status 
WHERE status = 'issued'::pickup_token_status;

-- Update generate_jornada_financial_summaries to use correct enum values and be robust
CREATE OR REPLACE FUNCTION public.generate_jornada_financial_summaries(
  p_jornada_id UUID,
  p_closed_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id UUID;
  v_pos RECORD;
  v_cost_check RECORD;
  v_total_issued INT := 0;
  v_total_redeemed INT := 0;
  v_total_pending INT := 0;
  v_total_expired INT := 0;
  v_total_cancelled INT := 0;
BEGIN
  -- Get venue_id from jornada
  SELECT venue_id INTO v_venue_id FROM jornadas WHERE id = p_jornada_id;
  
  -- Get token statistics using canonical values (with safe defaults)
  SELECT 
    COALESCE(COUNT(*), 0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status = 'redeemed'), 0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status = 'expired'), 0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status = 'cancelled'), 0)::int
  INTO v_total_issued, v_total_redeemed, v_total_pending, v_total_expired, v_total_cancelled
  FROM pickup_tokens
  WHERE jornada_id = p_jornada_id;
  
  -- Check cost completeness (with safe default)
  SELECT * INTO v_cost_check FROM check_jornada_cost_completeness(p_jornada_id);
  IF v_cost_check IS NULL THEN
    v_cost_check := (true, '[]'::jsonb, 0::numeric);
  END IF;
  
  -- Delete existing summaries
  DELETE FROM jornada_financial_summary WHERE jornada_id = p_jornada_id;
  
  -- Generate per-POS summaries
  FOR v_pos IN 
    SELECT pt.id as pos_id, pt.name as pos_name, pt.pos_type
    FROM pos_terminals pt
    WHERE pt.venue_id = v_venue_id AND pt.is_active = true
    AND pt.pos_type IN ('alcohol_sales', 'ticket_sales')
  LOOP
    INSERT INTO jornada_financial_summary (
      jornada_id, venue_id, pos_id, pos_type, closed_by, closed_at,
      gross_sales_total, net_sales_total, cancelled_sales_total, cancelled_transactions_count,
      transactions_count, sales_by_payment, expenses_total, expenses_by_type,
      net_operational_result, opening_cash, cash_sales, cash_expenses,
      expected_cash, counted_cash, cash_difference,
      tokens_issued_count, tokens_redeemed_count, tokens_pending_count,
      tokens_expired_count, tokens_cancelled_count,
      cogs_total, gross_margin, gross_margin_pct, cost_data_complete, missing_cost_items
    )
    SELECT 
      p_jornada_id, v_venue_id, v_pos.pos_id, v_pos.pos_type, p_closed_by, now(),
      -- Gross sales
      COALESCE((SELECT SUM(total_amount) FROM sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND (is_cancelled IS NULL OR is_cancelled = false)), 0) +
      COALESCE((SELECT SUM(total) FROM ticket_sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_status = 'completed'), 0),
      -- Net sales
      COALESCE((SELECT SUM(total_amount) FROM sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND (is_cancelled IS NULL OR is_cancelled = false)), 0) +
      COALESCE((SELECT SUM(total) FROM ticket_sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_status = 'completed'), 0),
      -- Cancelled
      COALESCE((SELECT SUM(total_amount) FROM sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND is_cancelled = true), 0),
      COALESCE((SELECT COUNT(*) FROM sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND is_cancelled = true), 0)::int,
      -- Transactions
      (COALESCE((SELECT COUNT(*) FROM sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND (is_cancelled IS NULL OR is_cancelled = false)), 0) +
       COALESCE((SELECT COUNT(*) FROM ticket_sales WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_status = 'completed'), 0))::int,
      -- Payment methods
      COALESCE((
        SELECT jsonb_object_agg(COALESCE(pm, 'other'), total)
        FROM (
          SELECT payment_method::text as pm, SUM(total_amount) as total FROM sales
          WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND (is_cancelled IS NULL OR is_cancelled = false)
          GROUP BY payment_method
          UNION ALL
          SELECT payment_method::text as pm, SUM(total) as total FROM ticket_sales
          WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_status = 'completed'
          GROUP BY payment_method
        ) combined
      ), '{}'::jsonb),
      -- Expenses
      COALESCE((SELECT SUM(amount) FROM expenses WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id), 0),
      COALESCE((SELECT jsonb_object_agg(expense_type, total) FROM (SELECT expense_type, SUM(amount) as total FROM expenses WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id GROUP BY expense_type) e), '{}'::jsonb),
      0, -- net_operational_result calculated later
      -- Cash register
      COALESCE((SELECT opening_cash_amount FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id LIMIT 1), 0),
      COALESCE((SELECT cash_sales_total FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id LIMIT 1), 0),
      COALESCE((SELECT SUM(amount) FROM expenses WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_method = 'cash'), 0),
      COALESCE((SELECT expected_cash FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id LIMIT 1), 0),
      COALESCE((SELECT closing_cash_counted FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id LIMIT 1), 0),
      COALESCE((SELECT difference FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id LIMIT 1), 0),
      -- Tokens (ticket_sales POS only)
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_total_issued ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_total_redeemed ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_total_pending ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_total_expired ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_total_cancelled ELSE 0 END,
      0, 0, 0, -- COGS per-POS not calculated
      COALESCE(v_cost_check.is_complete, true),
      COALESCE(v_cost_check.missing_items, '[]'::jsonb);
  END LOOP;
  
  -- Generate OVERALL summary
  INSERT INTO jornada_financial_summary (
    jornada_id, venue_id, pos_id, pos_type, closed_by, closed_at,
    gross_sales_total, net_sales_total, cancelled_sales_total, cancelled_transactions_count,
    transactions_count, sales_by_payment, expenses_total, expenses_by_type,
    net_operational_result, opening_cash, cash_sales, cash_expenses,
    expected_cash, counted_cash, cash_difference,
    tokens_issued_count, tokens_redeemed_count, tokens_pending_count,
    tokens_expired_count, tokens_cancelled_count,
    cogs_total, gross_margin, gross_margin_pct, cost_data_complete, missing_cost_items
  )
  SELECT 
    p_jornada_id, v_venue_id, NULL, 'overall', p_closed_by, now(),
    COALESCE(SUM(gross_sales_total), 0),
    COALESCE(SUM(net_sales_total), 0),
    COALESCE(SUM(cancelled_sales_total), 0),
    COALESCE(SUM(cancelled_transactions_count), 0)::int,
    COALESCE(SUM(transactions_count), 0)::int,
    COALESCE((SELECT jsonb_object_agg(key, value) FROM (SELECT key, SUM(value::numeric) as value FROM jornada_financial_summary, jsonb_each_text(sales_by_payment) WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL GROUP BY key) agg), '{}'::jsonb),
    COALESCE(SUM(expenses_total), 0) + COALESCE((SELECT SUM(amount) FROM expenses WHERE jornada_id = p_jornada_id AND pos_id IS NULL), 0),
    COALESCE((SELECT jsonb_object_agg(expense_type, total) FROM (SELECT expense_type, SUM(amount) as total FROM expenses WHERE jornada_id = p_jornada_id GROUP BY expense_type) e), '{}'::jsonb),
    COALESCE(SUM(gross_sales_total), 0) - (COALESCE(SUM(expenses_total), 0) + COALESCE((SELECT SUM(amount) FROM expenses WHERE jornada_id = p_jornada_id AND pos_id IS NULL), 0)),
    COALESCE(SUM(opening_cash), 0),
    COALESCE(SUM(cash_sales), 0),
    COALESCE(SUM(cash_expenses), 0) + COALESCE((SELECT SUM(amount) FROM expenses WHERE jornada_id = p_jornada_id AND pos_id IS NULL AND payment_method = 'cash'), 0),
    COALESCE(SUM(expected_cash), 0),
    COALESCE(SUM(counted_cash), 0),
    COALESCE(SUM(cash_difference), 0),
    v_total_issued, v_total_redeemed, v_total_pending, v_total_expired, v_total_cancelled,
    COALESCE(v_cost_check.total_cogs, 0),
    COALESCE(SUM(gross_sales_total), 0) - COALESCE(v_cost_check.total_cogs, 0),
    CASE WHEN COALESCE(SUM(gross_sales_total), 0) > 0 THEN ROUND(((COALESCE(SUM(gross_sales_total), 0) - COALESCE(v_cost_check.total_cogs, 0)) / COALESCE(SUM(gross_sales_total), 0)) * 100, 2) ELSE 0 END,
    COALESCE(v_cost_check.is_complete, true),
    COALESCE(v_cost_check.missing_items, '[]'::jsonb)
  FROM jornada_financial_summary
  WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL;
  
  -- Update net_operational_result for per-POS
  UPDATE jornada_financial_summary
  SET net_operational_result = gross_sales_total - expenses_total
  WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL;
END;
$$;

-- Update check_jornada_cost_completeness to handle empty jornadas
CREATE OR REPLACE FUNCTION public.check_jornada_cost_completeness(p_jornada_id UUID)
RETURNS TABLE (is_complete BOOLEAN, missing_items JSONB, total_cogs NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_missing JSONB := '[]'::jsonb;
  v_total_cogs NUMERIC := 0;
  v_sale RECORD;
  v_item RECORD;
  v_cocktail_check RECORD;
BEGIN
  FOR v_sale IN SELECT s.id as sale_id FROM sales s WHERE s.jornada_id = p_jornada_id AND (s.is_cancelled IS NULL OR s.is_cancelled = false)
  LOOP
    FOR v_item IN SELECT si.id, si.quantity, c.id as cocktail_id, c.name as cocktail_name FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id WHERE si.sale_id = v_sale.sale_id
    LOOP
      SELECT * INTO v_cocktail_check FROM validate_cocktail_cost(v_item.cocktail_id);
      IF v_cocktail_check IS NOT NULL AND NOT v_cocktail_check.is_valid THEN
        v_missing := v_missing || jsonb_build_object('type', 'cocktail', 'name', v_item.cocktail_name, 'issues', v_cocktail_check.missing_ingredients);
      ELSIF v_cocktail_check IS NOT NULL THEN
        v_total_cogs := v_total_cogs + (COALESCE(v_cocktail_check.total_cost, 0) * v_item.quantity);
      END IF;
    END LOOP;
  END LOOP;
  
  FOR v_item IN SELECT pt.id, pt.cover_quantity, c.id as cocktail_id, c.name as cocktail_name FROM pickup_tokens pt JOIN cocktails c ON c.id = pt.cover_cocktail_id WHERE pt.jornada_id = p_jornada_id AND pt.status = 'redeemed'
  LOOP
    SELECT * INTO v_cocktail_check FROM validate_cocktail_cost(v_item.cocktail_id);
    IF v_cocktail_check IS NOT NULL AND NOT v_cocktail_check.is_valid THEN
      v_missing := v_missing || jsonb_build_object('type', 'cover_cocktail', 'name', v_item.cocktail_name, 'issues', v_cocktail_check.missing_ingredients);
    ELSIF v_cocktail_check IS NOT NULL THEN
      v_total_cogs := v_total_cogs + (COALESCE(v_cocktail_check.total_cost, 0) * COALESCE(v_item.cover_quantity, 1));
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT (jsonb_array_length(v_missing) = 0), v_missing, v_total_cogs;
END;
$$;
