
-- ════════════════════════════════════════════════════════════════
-- 1. Unique index for learning mappings upsert
-- ════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS learning_product_mappings_venue_raw_uniq
  ON public.learning_product_mappings (venue_id, raw_text);

-- ════════════════════════════════════════════════════════════════
-- 2. apply_conteo_batch
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_conteo_batch(
  p_venue_id uuid,
  p_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied int := 0;
  v_skipped int := 0;
  v_user_venue uuid;
BEGIN
  -- Validate caller
  IF NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aplicar lotes';
  END IF;

  v_user_venue := get_user_venue_id();
  IF v_user_venue IS NULL OR v_user_venue <> p_venue_id THEN
    -- developers may operate cross-venue
    IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
      RAISE EXCEPTION 'Venue mismatch';
    END IF;
  END IF;

  -- Stage rows
  CREATE TEMP TABLE _conteo_in (
    product_id uuid,
    location_id uuid,
    stock_real numeric
  ) ON COMMIT DROP;

  INSERT INTO _conteo_in(product_id, location_id, stock_real)
  SELECT
    (r->>'product_id')::uuid,
    (r->>'location_id')::uuid,
    (r->>'stock_real')::numeric
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'product_id' IS NOT NULL
    AND r->>'location_id' IS NOT NULL
    AND r->>'stock_real' IS NOT NULL;

  -- Compute deltas vs existing balances
  CREATE TEMP TABLE _conteo_calc ON COMMIT DROP AS
  SELECT
    i.product_id,
    i.location_id,
    i.stock_real,
    COALESCE(b.quantity, 0) AS prev_qty,
    (i.stock_real - COALESCE(b.quantity, 0)) AS diff
  FROM _conteo_in i
  LEFT JOIN stock_balances b
    ON b.product_id = i.product_id
   AND b.location_id = i.location_id;

  -- Skip rows with diff = 0
  GET DIAGNOSTICS v_applied = ROW_COUNT;
  v_skipped := v_applied - (SELECT count(*) FROM _conteo_calc WHERE diff <> 0);
  v_applied := (SELECT count(*) FROM _conteo_calc WHERE diff <> 0);

  -- Upsert balances (full set including new rows where prev_qty=0)
  INSERT INTO stock_balances (product_id, location_id, venue_id, quantity)
  SELECT product_id, location_id, p_venue_id, stock_real
  FROM _conteo_calc
  WHERE diff <> 0
  ON CONFLICT (product_id, location_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        updated_at = now();

  -- Insert stock movements (one per row). Trigger update_stock_on_movement
  -- does NOT touch current_stock for waste/reconciliation, so we recompute below.
  INSERT INTO stock_movements (
    product_id, movement_type, quantity, notes, to_location_id, venue_id
  )
  SELECT
    product_id,
    CASE WHEN diff < 0 THEN 'waste'::movement_type ELSE 'reconciliation'::movement_type END,
    abs(diff),
    'Conteo: ' || CASE WHEN diff < 0 THEN 'merma' ELSE 'ajuste +' END || ' (' || diff::text || ')',
    location_id,
    p_venue_id
  FROM _conteo_calc
  WHERE diff <> 0;

  -- Recompute products.current_stock for affected products
  UPDATE products p
  SET current_stock = COALESCE(s.total, 0),
      updated_at = now()
  FROM (
    SELECT product_id, SUM(quantity) AS total
    FROM stock_balances
    WHERE venue_id = p_venue_id
      AND product_id IN (SELECT DISTINCT product_id FROM _conteo_calc WHERE diff <> 0)
    GROUP BY product_id
  ) s
  WHERE p.id = s.product_id;

  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 3. apply_compra_batch
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_compra_batch(
  p_venue_id uuid,
  p_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_default_location uuid;
  v_total_amount numeric;
  v_applied int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aplicar lotes';
  END IF;

  -- Stage
  CREATE TEMP TABLE _compra_in ON COMMIT DROP AS
  SELECT
    (r->>'product_id')::uuid AS product_id,
    (r->>'location_destino_id')::uuid AS location_id,
    COALESCE((r->>'unit_cost')::numeric, 0) AS unit_cost,
    COALESCE((r->>'quantity')::numeric, 0) AS qty_env,
    COALESCE((r->>'computed_base_qty')::numeric, 0) AS base_qty
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'product_id' IS NOT NULL
    AND r->>'location_destino_id' IS NOT NULL;

  SELECT location_id INTO v_default_location FROM _compra_in LIMIT 1;
  SELECT COALESCE(SUM(unit_cost * qty_env), 0) INTO v_total_amount FROM _compra_in;
  SELECT COUNT(*) INTO v_applied FROM _compra_in;

  -- Header
  INSERT INTO stock_intake_batches (
    venue_id, created_by, notes,
    total_net, total_vat, total_specific_tax, total_other_tax,
    total_amount, items_count, default_location_id
  ) VALUES (
    p_venue_id, p_user_id, 'Excel import (aprobado)',
    v_total_amount, 0, 0, 0,
    v_total_amount, v_applied, v_default_location
  ) RETURNING id INTO v_batch_id;

  -- Items
  INSERT INTO stock_intake_items (
    batch_id, product_id, location_id, quantity,
    net_unit_cost, vat_unit, specific_tax_unit, other_tax_unit,
    total_unit, total_line, venue_id
  )
  SELECT v_batch_id, product_id, location_id, qty_env,
         unit_cost, 0, 0, 0,
         unit_cost, unit_cost * qty_env, p_venue_id
  FROM _compra_in;

  -- Upsert balances
  INSERT INTO stock_balances (product_id, location_id, venue_id, quantity)
  SELECT product_id, location_id, p_venue_id, base_qty
  FROM _compra_in
  WHERE base_qty > 0
  ON CONFLICT (product_id, location_id) DO UPDATE
    SET quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();

  -- Movements (compra) — trigger DOES update current_stock for 'compra'
  INSERT INTO stock_movements (
    product_id, movement_type, quantity, notes,
    to_location_id, unit_cost_snapshot, total_cost_snapshot, venue_id
  )
  SELECT
    product_id, 'compra'::movement_type, base_qty, 'Excel compra (aprobado)',
    location_id, unit_cost, unit_cost * qty_env, p_venue_id
  FROM _compra_in
  WHERE base_qty > 0;

  -- Recompute CPP per product (Moving Weighted Average over the whole batch)
  -- For each affected product: new CPP = (oldStock*oldCost + Σ baseQty*unitCost) / (oldStock + Σ baseQty)
  -- For bottles (capacity_ml > 0), unit_cost is per-bottle and CPP is per-bottle (same formula in base units).
  WITH agg AS (
    SELECT
      product_id,
      SUM(base_qty) AS added_qty,
      SUM(base_qty * unit_cost) AS added_value
    FROM _compra_in
    WHERE base_qty > 0
    GROUP BY product_id
  ),
  totals AS (
    SELECT
      a.product_id,
      a.added_qty,
      a.added_value,
      COALESCE((SELECT SUM(quantity) FROM stock_balances WHERE venue_id = p_venue_id AND product_id = a.product_id), 0) AS total_now
    FROM agg a
  )
  UPDATE products p
  SET
    cost_per_unit = ROUND(
      CASE
        WHEN (t.total_now) > 0
          THEN ((t.total_now - t.added_qty) * p.cost_per_unit + t.added_value) / GREATEST(t.total_now, 1)
        ELSE p.cost_per_unit
      END
    ),
    current_stock = t.total_now,
    updated_at = now()
  FROM totals t
  WHERE p.id = t.product_id;

  RETURN jsonb_build_object('applied', v_applied, 'batch_id', v_batch_id);
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 4. apply_transferencia_batch
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_transferencia_batch(
  p_venue_id uuid,
  p_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_from uuid;
  v_to uuid;
  v_applied int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aplicar lotes';
  END IF;

  CREATE TEMP TABLE _trans_in ON COMMIT DROP AS
  SELECT
    (r->>'product_id')::uuid AS product_id,
    (r->>'location_origen_id')::uuid AS from_loc,
    (r->>'location_destino_id')::uuid AS to_loc,
    COALESCE((r->>'computed_base_qty')::numeric, 0) AS qty
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'product_id' IS NOT NULL
    AND r->>'location_origen_id' IS NOT NULL
    AND r->>'location_destino_id' IS NOT NULL;

  SELECT from_loc, to_loc INTO v_from, v_to FROM _trans_in LIMIT 1;
  SELECT COUNT(*) INTO v_applied FROM _trans_in;

  IF v_from IS NULL OR v_to IS NULL THEN
    RETURN jsonb_build_object('applied', 0);
  END IF;

  INSERT INTO stock_transfers (from_location_id, to_location_id, transferred_by, notes, venue_id)
  VALUES (v_from, v_to, p_user_id, 'Excel transferencia (aprobado)', p_venue_id)
  RETURNING id INTO v_transfer_id;

  INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, venue_id)
  SELECT v_transfer_id, product_id, qty, p_venue_id
  FROM _trans_in WHERE qty > 0;

  -- Decrement origin (clamp at 0)
  UPDATE stock_balances b
  SET quantity = GREATEST(0, b.quantity - t.qty),
      updated_at = now()
  FROM _trans_in t
  WHERE b.product_id = t.product_id
    AND b.location_id = t.from_loc
    AND t.qty > 0;

  -- Upsert destination
  INSERT INTO stock_balances (product_id, location_id, venue_id, quantity)
  SELECT product_id, to_loc, p_venue_id, qty
  FROM _trans_in WHERE qty > 0
  ON CONFLICT (product_id, location_id) DO UPDATE
    SET quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();

  -- Movements
  INSERT INTO stock_movements (product_id, movement_type, quantity, from_location_id, transfer_id, venue_id, notes)
  SELECT product_id, 'transfer_out'::movement_type, qty, from_loc, v_transfer_id, p_venue_id, 'Excel transfer salida'
  FROM _trans_in WHERE qty > 0;

  INSERT INTO stock_movements (product_id, movement_type, quantity, to_location_id, transfer_id, venue_id, notes)
  SELECT product_id, 'transfer_in'::movement_type, qty, to_loc, v_transfer_id, p_venue_id, 'Excel transfer entrada'
  FROM _trans_in WHERE qty > 0;

  -- Recompute current_stock per product (transfers don't change global total
  -- but recompute defensively to keep parity with previous logic).
  UPDATE products p
  SET current_stock = COALESCE(s.total, 0),
      updated_at = now()
  FROM (
    SELECT product_id, SUM(quantity) AS total
    FROM stock_balances
    WHERE venue_id = p_venue_id
      AND product_id IN (SELECT DISTINCT product_id FROM _trans_in WHERE qty > 0)
    GROUP BY product_id
  ) s
  WHERE p.id = s.product_id;

  RETURN jsonb_build_object('applied', v_applied, 'transfer_id', v_transfer_id);
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 5. save_learning_mappings_batch
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_learning_mappings_batch(
  p_venue_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden guardar aprendizaje';
  END IF;

  WITH ins AS (
    INSERT INTO learning_product_mappings (raw_text, product_id, venue_id, confidence, times_used)
    SELECT
      lower(trim(r->>'raw_text')),
      (r->>'product_id')::uuid,
      p_venue_id,
      COALESCE((r->>'confidence')::numeric, 0.7),
      1
    FROM jsonb_array_elements(p_rows) AS r
    WHERE r->>'raw_text' IS NOT NULL AND r->>'product_id' IS NOT NULL
    ON CONFLICT (venue_id, raw_text) DO UPDATE
      SET product_id = EXCLUDED.product_id,
          times_used = learning_product_mappings.times_used + 1,
          confidence = LEAST(1, EXCLUDED.confidence + learning_product_mappings.times_used * 0.05),
          last_used_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN jsonb_build_object('saved', v_count);
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.apply_conteo_batch(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_compra_batch(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transferencia_batch(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_learning_mappings_batch(uuid, jsonb) TO authenticated;
