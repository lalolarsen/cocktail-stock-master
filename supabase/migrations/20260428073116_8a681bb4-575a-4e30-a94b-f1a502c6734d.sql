CREATE OR REPLACE FUNCTION public.apply_shift_count(
  p_venue_id uuid,
  p_location_id uuid,
  p_jornada_id uuid,
  p_counts jsonb,           -- [{product_id, real_qty}]
  p_notes text DEFAULT NULL,
  p_threshold_pct numeric DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  theoretical numeric,
  real_qty numeric,
  delta numeric,
  pct_diff numeric,
  alerted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_can boolean;
  v_item jsonb;
  v_product_id uuid;
  v_real numeric;
  v_theo numeric;
  v_delta numeric;
  v_pct numeric;
  v_alerted boolean;
  v_product_name text;
  v_location_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Validate user belongs to this venue
  SELECT (get_user_venue_id() = p_venue_id) INTO v_can;
  IF NOT v_can THEN
    RAISE EXCEPTION 'Sin acceso a este venue';
  END IF;

  SELECT name INTO v_location_name FROM public.stock_locations WHERE id = p_location_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb))
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_real := COALESCE((v_item->>'real_qty')::numeric, 0);

    IF v_product_id IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(quantity, 0) INTO v_theo
    FROM public.stock_balances
    WHERE product_id = v_product_id
      AND location_id = p_location_id
      AND venue_id = p_venue_id;

    v_theo := COALESCE(v_theo, 0);
    v_delta := v_real - v_theo;

    IF v_theo = 0 THEN
      v_pct := CASE WHEN v_real = 0 THEN 0 ELSE 100 END;
    ELSE
      v_pct := ROUND(ABS(v_delta) / v_theo * 100, 2);
    END IF;

    -- Update stock_balances to real value
    INSERT INTO public.stock_balances (product_id, location_id, quantity, venue_id)
    VALUES (v_product_id, p_location_id, v_real, p_venue_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();

    -- Register movement (ajuste with delta)
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
        v_product_id,
        'count_variance',
        format('Conteo %s en %s: teórico %s, real %s (Δ %s, %s%%)',
               COALESCE(v_product_name, '?'),
               COALESCE(v_location_name, '?'),
               v_theo, v_real, v_delta, v_pct),
        p_jornada_id, p_venue_id
      );
      v_alerted := true;
    END IF;

    product_id := v_product_id;
    theoretical := v_theo;
    real_qty := v_real;
    delta := v_delta;
    pct_diff := v_pct;
    alerted := v_alerted;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_shift_count(uuid, uuid, uuid, jsonb, text, numeric) TO authenticated;