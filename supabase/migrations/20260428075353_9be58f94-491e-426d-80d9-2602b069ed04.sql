ALTER TABLE public.stock_movements REPLICA IDENTITY DEFAULT;

CREATE INDEX IF NOT EXISTS idx_stock_movements_venue_product_loc_created
  ON public.stock_movements (
    venue_id, product_id, COALESCE(to_location_id, from_location_id), created_at DESC
  );

DROP FUNCTION IF EXISTS public.get_realtime_inventory_snapshot(uuid);

CREATE FUNCTION public.get_realtime_inventory_snapshot(p_venue_id uuid)
RETURNS TABLE (
  product_id uuid, product_name text, sku_base text, category text,
  capacity_ml integer, is_bottle boolean,
  location_id uuid, location_name text, location_type text,
  quantity numeric, cpp numeric, stock_value numeric, min_quantity numeric,
  status text, last_movement_at timestamptz, is_totals boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      ROUND(COALESCE(sb.quantity, 0) * COALESCE(p.cost_per_unit, 0))::numeric AS stock_value,
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
$$;

GRANT EXECUTE ON FUNCTION public.get_realtime_inventory_snapshot(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.shift_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  jornada_id uuid REFERENCES public.jornadas(id),
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  user_id uuid REFERENCES auth.users(id),
  notes text,
  threshold_pct numeric NOT NULL DEFAULT 10,
  total_lines integer NOT NULL DEFAULT 0,
  alerted_lines integer NOT NULL DEFAULT 0,
  max_variance_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_counts_venue_created ON public.shift_counts(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_counts_jornada ON public.shift_counts(jornada_id);

CREATE TABLE IF NOT EXISTS public.shift_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.shift_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  theoretical numeric NOT NULL,
  real_qty numeric NOT NULL,
  delta numeric NOT NULL,
  pct_diff numeric NOT NULL,
  alerted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_count_lines_count ON public.shift_count_lines(count_id);

ALTER TABLE public.shift_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_count_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view shift counts" ON public.shift_counts;
CREATE POLICY "Venue members can view shift counts"
  ON public.shift_counts FOR SELECT TO authenticated
  USING (venue_id = get_user_venue_id());

DROP POLICY IF EXISTS "Venue members can view shift count lines" ON public.shift_count_lines;
CREATE POLICY "Venue members can view shift count lines"
  ON public.shift_count_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shift_counts sc
    WHERE sc.id = shift_count_lines.count_id AND sc.venue_id = get_user_venue_id()
  ));

CREATE OR REPLACE FUNCTION public.apply_shift_count(
  p_venue_id uuid, p_location_id uuid, p_jornada_id uuid,
  p_counts jsonb, p_notes text DEFAULT NULL, p_threshold_pct numeric DEFAULT 10
)
RETURNS TABLE (
  product_id uuid, theoretical numeric, real_qty numeric,
  delta numeric, pct_diff numeric, alerted boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_can boolean; v_item jsonb;
  v_product_id uuid; v_real numeric; v_theo numeric;
  v_delta numeric; v_pct numeric; v_alerted boolean;
  v_product_name text; v_location_name text;
  v_count_id uuid; v_total_lines integer := 0;
  v_alerted_lines integer := 0; v_max_pct numeric := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT (get_user_venue_id() = p_venue_id) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Sin acceso a este venue'; END IF;

  SELECT name INTO v_location_name FROM public.stock_locations WHERE id = p_location_id;

  INSERT INTO public.shift_counts (venue_id, jornada_id, location_id, user_id, notes, threshold_pct)
  VALUES (p_venue_id, p_jornada_id, p_location_id, v_user_id, p_notes, p_threshold_pct)
  RETURNING id INTO v_count_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb))
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_real := COALESCE((v_item->>'real_qty')::numeric, 0);
    IF v_product_id IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(quantity, 0) INTO v_theo
    FROM public.stock_balances
    WHERE product_id = v_product_id AND location_id = p_location_id AND venue_id = p_venue_id
    FOR UPDATE;

    v_theo := COALESCE(v_theo, 0);
    v_delta := v_real - v_theo;

    IF v_theo = 0 THEN
      v_pct := CASE WHEN v_real = 0 THEN 0 ELSE 100 END;
    ELSE
      v_pct := ROUND(ABS(v_delta) / v_theo * 100, 2);
    END IF;

    INSERT INTO public.stock_balances (product_id, location_id, quantity, venue_id)
    VALUES (v_product_id, p_location_id, v_real, p_venue_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity, notes,
        jornada_id, to_location_id, source_type, venue_id
      ) VALUES (
        v_product_id, 'ajuste'::movement_type, v_delta,
        COALESCE(p_notes, '') || ' [conteo cierre]',
        p_jornada_id, p_location_id, 'shift_count', p_venue_id
      );
    END IF;

    v_alerted := false;
    IF v_pct >= p_threshold_pct AND ABS(v_delta) > 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      INSERT INTO public.stock_alerts (product_id, alert_type, message, jornada_id, venue_id)
      VALUES (
        v_product_id, 'count_variance',
        format('Conteo %s en %s: teórico %s, real %s (Δ %s, %s%%)',
               COALESCE(v_product_name, '?'), COALESCE(v_location_name, '?'),
               v_theo, v_real, v_delta, v_pct),
        p_jornada_id, p_venue_id
      );
      v_alerted := true;
      v_alerted_lines := v_alerted_lines + 1;
    END IF;

    INSERT INTO public.shift_count_lines (count_id, product_id, theoretical, real_qty, delta, pct_diff, alerted)
    VALUES (v_count_id, v_product_id, v_theo, v_real, v_delta, v_pct, v_alerted);

    v_total_lines := v_total_lines + 1;
    IF v_pct > v_max_pct THEN v_max_pct := v_pct; END IF;

    product_id := v_product_id; theoretical := v_theo; real_qty := v_real;
    delta := v_delta; pct_diff := v_pct; alerted := v_alerted;
    RETURN NEXT;
  END LOOP;

  UPDATE public.shift_counts
     SET total_lines = v_total_lines, alerted_lines = v_alerted_lines, max_variance_pct = v_max_pct
   WHERE id = v_count_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_shift_count(uuid, uuid, uuid, jsonb, text, numeric) TO authenticated;

DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_alerts';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;