CREATE OR REPLACE FUNCTION public.get_realtime_inventory_snapshot(p_venue_id uuid)
 RETURNS TABLE(product_id uuid, product_name text, sku_base text, category text, capacity_ml integer, is_bottle boolean, location_id uuid, location_name text, location_type text, quantity numeric, cpp numeric, stock_value numeric, min_quantity numeric, status text, last_movement_at timestamp with time zone, is_totals boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH last_mov AS (
    SELECT DISTINCT ON (sm.product_id, COALESCE(sm.to_location_id, sm.from_location_id))
      sm.product_id,
      COALESCE(sm.to_location_id, sm.from_location_id) AS location_id,
      sm.created_at AS last_movement_at
    FROM public.stock_movements sm
    WHERE sm.venue_id = p_venue_id
      AND sm.created_at > now() - interval '30 days'
    ORDER BY sm.product_id, COALESCE(sm.to_location_id, sm.from_location_id), sm.created_at DESC
  ),
  rows AS (
    SELECT
      p.id AS product_id, p.name AS product_name, p.code AS sku_base,
      p.category::text AS category, p.capacity_ml,
      (COALESCE(p.capacity_ml, 0) > 0) AS is_bottle,
      sl.id AS location_id, sl.name AS location_name, sl.type::text AS location_type,
      COALESCE(sb.quantity, 0)::numeric AS quantity,
      COALESCE(p.cost_per_unit, 0)::numeric AS cpp,
      ROUND(
        COALESCE(sb.quantity, 0) *
        CASE
          WHEN COALESCE(p.capacity_ml, 0) > 0
            THEN COALESCE(p.cost_per_unit, 0) / p.capacity_ml
          ELSE COALESCE(p.cost_per_unit, 0)
        END
      )::numeric AS stock_value,
      COALESCE(slm.minimum_stock, p.minimum_stock, 0)::numeric AS min_quantity,
      CASE
        WHEN COALESCE(sb.quantity, 0) <= 0 THEN 'critical'
        WHEN COALESCE(slm.minimum_stock, p.minimum_stock, 0) > 0
             AND COALESCE(sb.quantity, 0) < COALESCE(slm.minimum_stock, p.minimum_stock, 0) THEN 'low'
        ELSE 'ok'
      END::text AS status,
      lm.last_movement_at, false AS is_totals
    FROM public.stock_balances sb
    JOIN public.products p ON p.id = sb.product_id
    JOIN public.stock_locations sl ON sl.id = sb.location_id
    LEFT JOIN public.stock_location_minimums slm
      ON slm.product_id = sb.product_id AND slm.location_id = sb.location_id
    LEFT JOIN last_mov lm
      ON lm.product_id = sb.product_id AND lm.location_id = sb.location_id
    WHERE sb.venue_id = p_venue_id
  ),
  totals AS (
    SELECT
      NULL::uuid, 'TOTALS'::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::uuid, NULL::text, NULL::text,
      SUM(quantity)::numeric, 0::numeric, SUM(stock_value)::numeric, 0::numeric,
      ('count_low='  || COUNT(*) FILTER (WHERE status='low') ||
       '|count_critical=' || COUNT(*) FILTER (WHERE status='critical') ||
       '|count_products=' || COUNT(DISTINCT product_id) FILTER (WHERE quantity > 0))::text,
      NULL::timestamptz, true
    FROM rows
  )
  SELECT * FROM rows
  UNION ALL
  SELECT * FROM totals
  ORDER BY 16, 8 NULLS LAST, 2 NULLS LAST;
$function$;