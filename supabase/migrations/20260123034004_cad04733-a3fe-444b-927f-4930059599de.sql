
-- COST LAW: Enforce costs on all inventory, enable COGS and gross margin reporting

-- 1) PRODUCTS: Enforce unit_cost NOT NULL and >= 0
-- First, update any NULL costs to 0 (these will need to be fixed by admin)
UPDATE public.products 
SET cost_per_unit = 0 
WHERE cost_per_unit IS NULL;

-- Add CHECK constraint
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS products_cost_per_unit_check;

ALTER TABLE public.products 
ADD CONSTRAINT products_cost_per_unit_check 
CHECK (cost_per_unit >= 0);

-- Make cost_per_unit NOT NULL
ALTER TABLE public.products 
ALTER COLUMN cost_per_unit SET NOT NULL;

ALTER TABLE public.products 
ALTER COLUMN cost_per_unit SET DEFAULT 0;

COMMENT ON COLUMN public.products.cost_per_unit IS 'Required: Cost per unit of measurement. Must be >= 0.';

-- 2) JORNADA_FINANCIAL_SUMMARY: Add COGS and margin fields
ALTER TABLE public.jornada_financial_summary 
ADD COLUMN IF NOT EXISTS cogs_total NUMERIC DEFAULT 0;

ALTER TABLE public.jornada_financial_summary 
ADD COLUMN IF NOT EXISTS gross_margin NUMERIC DEFAULT 0;

ALTER TABLE public.jornada_financial_summary 
ADD COLUMN IF NOT EXISTS gross_margin_pct NUMERIC DEFAULT 0;

ALTER TABLE public.jornada_financial_summary 
ADD COLUMN IF NOT EXISTS cost_data_complete BOOLEAN DEFAULT true;

ALTER TABLE public.jornada_financial_summary 
ADD COLUMN IF NOT EXISTS missing_cost_items JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.jornada_financial_summary.cogs_total IS 'Cost of Goods Sold for the period';
COMMENT ON COLUMN public.jornada_financial_summary.gross_margin IS 'Gross margin: gross_sales_total - cogs_total';
COMMENT ON COLUMN public.jornada_financial_summary.gross_margin_pct IS 'Gross margin percentage: (gross_margin / gross_sales_total) * 100';
COMMENT ON COLUMN public.jornada_financial_summary.cost_data_complete IS 'False if any sold items lack cost data';
COMMENT ON COLUMN public.jornada_financial_summary.missing_cost_items IS 'List of items missing cost/recipe data';

-- 3) STOCK_MOVEMENTS: Add cost snapshot fields for v2 audit trail
ALTER TABLE public.stock_movements 
ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC DEFAULT NULL;

ALTER TABLE public.stock_movements 
ADD COLUMN IF NOT EXISTS total_cost_snapshot NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.stock_movements.unit_cost_snapshot IS 'Snapshot of unit cost at time of movement for stable reporting';
COMMENT ON COLUMN public.stock_movements.total_cost_snapshot IS 'Snapshot of total cost (quantity * unit_cost) at time of movement';

-- 4) COCKTAILS: Add waste configuration
ALTER TABLE public.cocktails 
ADD COLUMN IF NOT EXISTS waste_ml_per_serving NUMERIC DEFAULT 3;

COMMENT ON COLUMN public.cocktails.waste_ml_per_serving IS 'Optional waste/spillage adjustment in ml per serving (default 3ml)';

-- 5) Create function to validate cocktail cost completeness
CREATE OR REPLACE FUNCTION public.validate_cocktail_cost(p_cocktail_id UUID)
RETURNS TABLE (
  is_valid BOOLEAN,
  missing_ingredients TEXT[],
  total_cost NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_total_cost NUMERIC := 0;
  v_ingredient RECORD;
  v_has_ingredients BOOLEAN := false;
BEGIN
  -- Check each ingredient
  FOR v_ingredient IN 
    SELECT 
      ci.id,
      ci.quantity,
      p.name as product_name,
      p.cost_per_unit,
      p.unit
    FROM cocktail_ingredients ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cocktail_id = p_cocktail_id
  LOOP
    v_has_ingredients := true;
    
    IF v_ingredient.cost_per_unit IS NULL OR v_ingredient.cost_per_unit = 0 THEN
      v_missing := array_append(v_missing, v_ingredient.product_name);
    ELSE
      v_total_cost := v_total_cost + (v_ingredient.quantity * v_ingredient.cost_per_unit);
    END IF;
  END LOOP;
  
  -- If no ingredients, cocktail is invalid
  IF NOT v_has_ingredients THEN
    RETURN QUERY SELECT false, ARRAY['Sin ingredientes']::TEXT[], 0::NUMERIC;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT (array_length(v_missing, 1) IS NULL), v_missing, v_total_cost;
END;
$$;

-- 6) Create function to check cost completeness for a jornada
CREATE OR REPLACE FUNCTION public.check_jornada_cost_completeness(p_jornada_id UUID)
RETURNS TABLE (
  is_complete BOOLEAN,
  missing_items JSONB,
  total_cogs NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing JSONB := '[]'::jsonb;
  v_total_cogs NUMERIC := 0;
  v_sale RECORD;
  v_item RECORD;
  v_cocktail_check RECORD;
BEGIN
  -- Loop through all sales in this jornada
  FOR v_sale IN 
    SELECT s.id as sale_id
    FROM sales s
    WHERE s.jornada_id = p_jornada_id
    AND (s.is_cancelled IS NULL OR s.is_cancelled = false)
  LOOP
    -- Check each sale item
    FOR v_item IN 
      SELECT 
        si.id,
        si.quantity,
        c.id as cocktail_id,
        c.name as cocktail_name
      FROM sale_items si
      JOIN cocktails c ON c.id = si.cocktail_id
      WHERE si.sale_id = v_sale.sale_id
    LOOP
      -- Validate cocktail cost
      SELECT * INTO v_cocktail_check 
      FROM validate_cocktail_cost(v_item.cocktail_id);
      
      IF NOT v_cocktail_check.is_valid THEN
        v_missing := v_missing || jsonb_build_object(
          'type', 'cocktail',
          'name', v_item.cocktail_name,
          'issues', v_cocktail_check.missing_ingredients
        );
      ELSE
        v_total_cogs := v_total_cogs + (v_cocktail_check.total_cost * v_item.quantity);
      END IF;
    END LOOP;
  END LOOP;
  
  -- Also check ticket sales with covers (pickup tokens)
  FOR v_item IN 
    SELECT 
      pt.id,
      pt.cover_quantity,
      c.id as cocktail_id,
      c.name as cocktail_name
    FROM pickup_tokens pt
    JOIN cocktails c ON c.id = pt.cover_cocktail_id
    WHERE pt.jornada_id = p_jornada_id
    AND pt.status = 'redeemed'
  LOOP
    SELECT * INTO v_cocktail_check 
    FROM validate_cocktail_cost(v_item.cocktail_id);
    
    IF NOT v_cocktail_check.is_valid THEN
      v_missing := v_missing || jsonb_build_object(
        'type', 'cover_cocktail',
        'name', v_item.cocktail_name,
        'issues', v_cocktail_check.missing_ingredients
      );
    ELSE
      v_total_cogs := v_total_cogs + (v_cocktail_check.total_cost * COALESCE(v_item.cover_quantity, 1));
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT (jsonb_array_length(v_missing) = 0), v_missing, v_total_cogs;
END;
$$;

-- 7) Update generate_jornada_financial_summaries to include COGS
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
  v_token_stats RECORD;
BEGIN
  -- Get venue_id from jornada
  SELECT venue_id INTO v_venue_id FROM jornadas WHERE id = p_jornada_id;
  
  -- Get token statistics for the jornada
  SELECT 
    COUNT(*) FILTER (WHERE status IS NOT NULL) as total_issued,
    COUNT(*) FILTER (WHERE status = 'redeemed') as total_redeemed,
    COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
    COUNT(*) FILTER (WHERE status = 'expired') as total_expired,
    COUNT(*) FILTER (WHERE status = 'cancelled') as total_cancelled
  INTO v_token_stats
  FROM pickup_tokens
  WHERE jornada_id = p_jornada_id;
  
  -- Check cost completeness
  SELECT * INTO v_cost_check FROM check_jornada_cost_completeness(p_jornada_id);
  
  -- Delete existing summaries for this jornada
  DELETE FROM jornada_financial_summary WHERE jornada_id = p_jornada_id;
  
  -- Generate per-POS summaries for alcohol sales POS
  FOR v_pos IN 
    SELECT 
      pt.id as pos_id,
      pt.name as pos_name,
      pt.pos_type
    FROM pos_terminals pt
    WHERE pt.venue_id = v_venue_id
    AND pt.is_active = true
    AND pt.pos_type IN ('alcohol_sales', 'ticket_sales')
  LOOP
    INSERT INTO jornada_financial_summary (
      jornada_id,
      venue_id,
      pos_id,
      pos_type,
      closed_by,
      closed_at,
      gross_sales_total,
      net_sales_total,
      cancelled_sales_total,
      cancelled_transactions_count,
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
      tokens_cancelled_count,
      cogs_total,
      gross_margin,
      gross_margin_pct,
      cost_data_complete,
      missing_cost_items
    )
    SELECT 
      p_jornada_id,
      v_venue_id,
      v_pos.pos_id,
      v_pos.pos_type,
      p_closed_by,
      now(),
      -- Gross sales (alcohol + tickets for this POS)
      COALESCE((
        SELECT SUM(total_amount) 
        FROM sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND (is_cancelled IS NULL OR is_cancelled = false)
      ), 0) + 
      COALESCE((
        SELECT SUM(total) 
        FROM ticket_sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND payment_status = 'completed'
      ), 0),
      -- Net sales (same as gross for now)
      COALESCE((
        SELECT SUM(total_amount) 
        FROM sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND (is_cancelled IS NULL OR is_cancelled = false)
      ), 0) + 
      COALESCE((
        SELECT SUM(total) 
        FROM ticket_sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND payment_status = 'completed'
      ), 0),
      -- Cancelled sales
      COALESCE((
        SELECT SUM(total_amount) 
        FROM sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND is_cancelled = true
      ), 0),
      -- Cancelled count
      COALESCE((
        SELECT COUNT(*) 
        FROM sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND is_cancelled = true
      ), 0),
      -- Transaction count
      COALESCE((
        SELECT COUNT(*) 
        FROM sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND (is_cancelled IS NULL OR is_cancelled = false)
      ), 0) + 
      COALESCE((
        SELECT COUNT(*) 
        FROM ticket_sales 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
        AND payment_status = 'completed'
      ), 0),
      -- Sales by payment method
      (
        SELECT jsonb_object_agg(
          COALESCE(payment_method::text, 'other'),
          total
        )
        FROM (
          SELECT payment_method, SUM(total_amount) as total
          FROM sales
          WHERE jornada_id = p_jornada_id 
          AND pos_id = v_pos.pos_id
          AND (is_cancelled IS NULL OR is_cancelled = false)
          GROUP BY payment_method
          UNION ALL
          SELECT payment_method, SUM(total) as total
          FROM ticket_sales
          WHERE jornada_id = p_jornada_id 
          AND pos_id = v_pos.pos_id
          AND payment_status = 'completed'
          GROUP BY payment_method
        ) combined
      ),
      -- Expenses total for this POS
      COALESCE((
        SELECT SUM(amount) 
        FROM expenses 
        WHERE jornada_id = p_jornada_id 
        AND pos_id = v_pos.pos_id
      ), 0),
      -- Expenses by type
      COALESCE((
        SELECT jsonb_object_agg(expense_type, total)
        FROM (
          SELECT expense_type, SUM(amount) as total
          FROM expenses
          WHERE jornada_id = p_jornada_id 
          AND pos_id = v_pos.pos_id
          GROUP BY expense_type
        ) exp
      ), '{}'::jsonb),
      -- Net operational result (calculated after insert)
      0,
      -- Cash register fields from closings
      COALESCE((SELECT opening_cash_amount FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id), 0),
      COALESCE((SELECT cash_sales_total FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id), 0),
      COALESCE((SELECT SUM(amount) FROM expenses WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id AND payment_method = 'cash'), 0),
      COALESCE((SELECT expected_cash FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id), 0),
      COALESCE((SELECT closing_cash_counted FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id), 0),
      COALESCE((SELECT difference FROM jornada_cash_closings WHERE jornada_id = p_jornada_id AND pos_id = v_pos.pos_id), 0),
      -- Token stats (only for POS that issue them - typically ticket_sales)
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_token_stats.total_issued ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_token_stats.total_redeemed ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_token_stats.total_pending ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_token_stats.total_expired ELSE 0 END,
      CASE WHEN v_pos.pos_type = 'ticket_sales' THEN v_token_stats.total_cancelled ELSE 0 END,
      -- COGS (proportional by POS based on sales)
      0, -- Will be updated in overall calculation
      0, -- gross_margin
      0, -- gross_margin_pct
      v_cost_check.is_complete,
      v_cost_check.missing_items;
  END LOOP;
  
  -- Generate OVERALL summary (pos_id = NULL)
  INSERT INTO jornada_financial_summary (
    jornada_id,
    venue_id,
    pos_id,
    pos_type,
    closed_by,
    closed_at,
    gross_sales_total,
    net_sales_total,
    cancelled_sales_total,
    cancelled_transactions_count,
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
    tokens_cancelled_count,
    cogs_total,
    gross_margin,
    gross_margin_pct,
    cost_data_complete,
    missing_cost_items
  )
  SELECT 
    p_jornada_id,
    v_venue_id,
    NULL, -- Overall
    'overall',
    p_closed_by,
    now(),
    -- Aggregates from per-POS
    COALESCE(SUM(gross_sales_total), 0),
    COALESCE(SUM(net_sales_total), 0),
    COALESCE(SUM(cancelled_sales_total), 0),
    COALESCE(SUM(cancelled_transactions_count), 0),
    COALESCE(SUM(transactions_count), 0),
    -- Combine payment methods
    (
      SELECT jsonb_object_agg(key, value)
      FROM (
        SELECT key, SUM(value::numeric) as value
        FROM jornada_financial_summary, jsonb_each_text(sales_by_payment)
        WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL
        GROUP BY key
      ) agg
    ),
    -- Overall expenses (including general expenses without pos_id)
    COALESCE(SUM(expenses_total), 0) + COALESCE((
      SELECT SUM(amount) FROM expenses 
      WHERE jornada_id = p_jornada_id AND pos_id IS NULL
    ), 0),
    -- Combined expenses by type
    (
      SELECT jsonb_object_agg(expense_type, total)
      FROM (
        SELECT expense_type, SUM(amount) as total
        FROM expenses
        WHERE jornada_id = p_jornada_id
        GROUP BY expense_type
      ) exp
    ),
    -- Net operational result
    COALESCE(SUM(gross_sales_total), 0) - 
    (COALESCE(SUM(expenses_total), 0) + COALESCE((
      SELECT SUM(amount) FROM expenses 
      WHERE jornada_id = p_jornada_id AND pos_id IS NULL
    ), 0)),
    -- Cash totals
    COALESCE(SUM(opening_cash), 0),
    COALESCE(SUM(cash_sales), 0),
    COALESCE(SUM(cash_expenses), 0) + COALESCE((
      SELECT SUM(amount) FROM expenses 
      WHERE jornada_id = p_jornada_id AND pos_id IS NULL AND payment_method = 'cash'
    ), 0),
    COALESCE(SUM(expected_cash), 0),
    COALESCE(SUM(counted_cash), 0),
    COALESCE(SUM(cash_difference), 0),
    -- Token totals
    v_token_stats.total_issued,
    v_token_stats.total_redeemed,
    v_token_stats.total_pending,
    v_token_stats.total_expired,
    v_token_stats.total_cancelled,
    -- COGS
    v_cost_check.total_cogs,
    -- Gross margin
    COALESCE(SUM(gross_sales_total), 0) - v_cost_check.total_cogs,
    -- Gross margin percentage
    CASE 
      WHEN COALESCE(SUM(gross_sales_total), 0) > 0 
      THEN ROUND(((COALESCE(SUM(gross_sales_total), 0) - v_cost_check.total_cogs) / COALESCE(SUM(gross_sales_total), 0)) * 100, 2)
      ELSE 0 
    END,
    v_cost_check.is_complete,
    v_cost_check.missing_items
  FROM jornada_financial_summary
  WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL;
  
  -- Update net_operational_result for per-POS summaries
  UPDATE jornada_financial_summary
  SET net_operational_result = gross_sales_total - expenses_total
  WHERE jornada_id = p_jornada_id AND pos_id IS NOT NULL;
END;
$$;
