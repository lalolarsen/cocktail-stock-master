DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_balances';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.stock_balances REPLICA IDENTITY FULL;
ALTER TABLE public.stock_movements REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.get_realtime_inventory_snapshot(p_venue_id uuid)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku_base text,
  category text,
  capacity_ml integer,
  is_bottle boolean,
  location_id uuid,
  location_name text,
  location_type text,
  quantity numeric,
  cpp numeric,
  stock_value numeric,
  min_quantity numeric,
  status text,
  last_movement_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_mov AS (
    SELECT
      sm.product_id,
      COALESCE(sm.to_location_id, sm.from_location_id) AS location_id,
      MAX(sm.created_at) AS last_movement_at
    FROM public.stock_movements sm
    WHERE sm.venue_id = p_venue_id
    GROUP BY sm.product_id, COALESCE(sm.to_location_id, sm.from_location_id)
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.code AS sku_base,
    p.category::text AS category,
    p.capacity_ml,
    (COALESCE(p.capacity_ml, 0) > 0) AS is_bottle,
    sl.id AS location_id,
    sl.name AS location_name,
    sl.type AS location_type,
    COALESCE(sb.quantity, 0) AS quantity,
    COALESCE(p.cost_per_unit, 0) AS cpp,
    ROUND(COALESCE(sb.quantity, 0) * COALESCE(p.cost_per_unit, 0))::numeric AS stock_value,
    COALESCE(slm.minimum_stock, p.minimum_stock, 0) AS min_quantity,
    CASE
      WHEN COALESCE(sb.quantity, 0) <= 0 THEN 'critical'
      WHEN COALESCE(slm.minimum_stock, p.minimum_stock, 0) > 0
           AND COALESCE(sb.quantity, 0) < COALESCE(slm.minimum_stock, p.minimum_stock, 0) THEN 'low'
      ELSE 'ok'
    END AS status,
    lm.last_movement_at
  FROM public.stock_balances sb
  JOIN public.products p ON p.id = sb.product_id
  JOIN public.stock_locations sl ON sl.id = sb.location_id
  LEFT JOIN public.stock_location_minimums slm
    ON slm.product_id = sb.product_id AND slm.location_id = sb.location_id
  LEFT JOIN last_mov lm
    ON lm.product_id = sb.product_id AND lm.location_id = sb.location_id
  WHERE sb.venue_id = p_venue_id
  ORDER BY sl.name, p.name
$$;

GRANT EXECUTE ON FUNCTION public.get_realtime_inventory_snapshot(uuid) TO authenticated;