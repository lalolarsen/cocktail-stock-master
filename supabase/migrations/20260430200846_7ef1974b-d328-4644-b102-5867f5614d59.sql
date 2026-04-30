DROP FUNCTION IF EXISTS public.get_shift_consumed_products(uuid, uuid);

CREATE FUNCTION public.get_shift_consumed_products(
  p_jornada_id uuid,
  p_location_id uuid
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  unit text,
  capacity_ml integer,
  category text,
  source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  SELECT venue_id INTO v_venue_id FROM jornadas WHERE id = p_jornada_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Jornada no encontrada';
  END IF;

  RETURN QUERY
  WITH consumed AS (
    SELECT DISTINCT sm.product_id
    FROM stock_movements sm
    WHERE sm.venue_id = v_venue_id
      AND sm.location_id = p_location_id
      AND sm.jornada_id = p_jornada_id
      AND sm.movement_type IN ('salida','venta','redencion','merma')
  ),
  closed_in_bar AS (
    SELECT sb.product_id
    FROM stock_balances sb
    WHERE sb.venue_id = v_venue_id
      AND sb.location_id = p_location_id
      AND sb.quantity > 0
      AND EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = sb.product_id
          AND COALESCE(p.capacity_ml, 0) > 0
      )
  ),
  combined AS (
    SELECT product_id, 'consumed'::text AS src FROM consumed
    UNION ALL
    SELECT product_id, 'closed_bottle'::text AS src FROM closed_in_bar
  ),
  agg AS (
    SELECT
      c.product_id,
      CASE
        WHEN bool_or(c.src = 'consumed') AND bool_or(c.src = 'closed_bottle') THEN 'both'
        WHEN bool_or(c.src = 'consumed') THEN 'consumed'
        ELSE 'closed_bottle'
      END AS src
    FROM combined c
    GROUP BY c.product_id
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(p.unit, 'u') AS unit,
    p.capacity_ml,
    p.category,
    a.src AS source
  FROM agg a
  JOIN products p ON p.id = a.product_id
  WHERE p.venue_id = v_venue_id
  ORDER BY p.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_blind_shift_count(
  p_jornada_id uuid,
  p_location_id uuid,
  p_lines jsonb,
  p_threshold_pct numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_line jsonb;
  v_product_id uuid;
  v_declared numeric;
  v_theoretical numeric;
  v_variance numeric;
  v_variance_pct numeric;
  v_accepted int := 0;
BEGIN
  SELECT venue_id INTO v_venue_id FROM jornadas WHERE id = p_jornada_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Jornada no encontrada';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_declared := COALESCE((v_line->>'declared_qty')::numeric, 0);

    SELECT COALESCE(quantity, 0) INTO v_theoretical
    FROM stock_balances
    WHERE venue_id = v_venue_id
      AND location_id = p_location_id
      AND product_id = v_product_id;

    v_theoretical := COALESCE(v_theoretical, 0);
    v_variance := v_declared - v_theoretical;
    v_variance_pct := CASE WHEN v_theoretical > 0
      THEN ROUND(ABS(v_variance) / v_theoretical * 100, 2)
      ELSE NULL
    END;

    INSERT INTO blind_shift_counts (
      venue_id, jornada_id, location_id, product_id,
      theoretical_qty, declared_qty, variance_qty, variance_pct,
      alerted, signed_by_user_id, signed_at, admin_decision
    ) VALUES (
      v_venue_id, p_jornada_id, p_location_id, v_product_id,
      v_theoretical, v_declared, v_variance, v_variance_pct,
      (v_variance <> 0),
      v_user_id, now(), 'pending'
    );
    v_accepted := v_accepted + 1;
  END LOOP;

  RETURN jsonb_build_object('accepted_count', v_accepted);
END;
$$;