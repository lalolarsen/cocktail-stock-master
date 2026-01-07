-- Add unit_cost and source_type columns to stock_movements
ALTER TABLE public.stock_movements 
ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_type text DEFAULT NULL;

-- Create index for cost of sales queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_cost_of_sales 
ON public.stock_movements (movement_type, source_type, jornada_id) 
WHERE movement_type = 'salida' AND source_type IN ('sale', 'pickup');

-- Function to get cost of sales by jornada_id
CREATE OR REPLACE FUNCTION public.get_cost_of_sales_by_jornada(p_jornada_id uuid)
RETURNS TABLE (
  total_cost numeric,
  items_count bigint,
  products_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COALESCE(SUM(ABS(quantity) * unit_cost), 0) as total_cost,
    COUNT(*) as items_count,
    COUNT(DISTINCT product_id) as products_count
  FROM public.stock_movements
  WHERE jornada_id = p_jornada_id
    AND movement_type = 'salida'
    AND source_type IN ('sale', 'pickup')
    AND unit_cost IS NOT NULL;
$$;

-- Function to get cost of sales by date range
CREATE OR REPLACE FUNCTION public.get_cost_of_sales_by_date_range(
  p_from_date date,
  p_to_date date
)
RETURNS TABLE (
  total_cost numeric,
  items_count bigint,
  products_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COALESCE(SUM(ABS(sm.quantity) * sm.unit_cost), 0) as total_cost,
    COUNT(*) as items_count,
    COUNT(DISTINCT sm.product_id) as products_count
  FROM public.stock_movements sm
  WHERE sm.created_at >= p_from_date::timestamptz
    AND sm.created_at < (p_to_date + interval '1 day')::timestamptz
    AND sm.movement_type = 'salida'
    AND sm.source_type IN ('sale', 'pickup')
    AND sm.unit_cost IS NOT NULL;
$$;

-- Function to get cost of sales breakdown by product
CREATE OR REPLACE FUNCTION public.get_cost_of_sales_by_product(
  p_jornada_id uuid DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  total_quantity numeric,
  avg_unit_cost numeric,
  total_cost numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sm.product_id,
    p.name as product_name,
    SUM(ABS(sm.quantity)) as total_quantity,
    AVG(sm.unit_cost) as avg_unit_cost,
    SUM(ABS(sm.quantity) * sm.unit_cost) as total_cost
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  WHERE sm.movement_type = 'salida'
    AND sm.source_type IN ('sale', 'pickup')
    AND sm.unit_cost IS NOT NULL
    AND (
      (p_jornada_id IS NOT NULL AND sm.jornada_id = p_jornada_id)
      OR (p_jornada_id IS NULL AND p_from_date IS NOT NULL AND p_to_date IS NOT NULL 
          AND sm.created_at >= p_from_date::timestamptz 
          AND sm.created_at < (p_to_date + interval '1 day')::timestamptz)
    )
  GROUP BY sm.product_id, p.name
  ORDER BY total_cost DESC;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_cost_of_sales_by_jornada IS 'Calculate cost of sales for a specific jornada based on actual stock consumption';
COMMENT ON FUNCTION public.get_cost_of_sales_by_date_range IS 'Calculate cost of sales for a date range based on actual stock consumption';
COMMENT ON FUNCTION public.get_cost_of_sales_by_product IS 'Get cost of sales breakdown by product for analysis';