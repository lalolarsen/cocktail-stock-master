-- ============================================================
-- 1) blind_shift_counts (per-product blind closing count)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blind_shift_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  theoretical_qty NUMERIC NOT NULL DEFAULT 0,
  declared_qty NUMERIC NOT NULL DEFAULT 0,
  variance_qty NUMERIC NOT NULL DEFAULT 0,
  variance_pct NUMERIC NOT NULL DEFAULT 0,
  alerted BOOLEAN NOT NULL DEFAULT false,
  signed_by_user_id UUID NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (admin_decision IN ('pending','approved_waste','rejected','manual_adjust','accepted_no_adjust')),
  admin_decision_by UUID,
  admin_decision_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jornada_id, location_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_blind_shift_counts_venue ON public.blind_shift_counts(venue_id);
CREATE INDEX IF NOT EXISTS idx_blind_shift_counts_jornada ON public.blind_shift_counts(jornada_id);
CREATE INDEX IF NOT EXISTS idx_blind_shift_counts_pending
  ON public.blind_shift_counts(venue_id) WHERE admin_decision = 'pending';

ALTER TABLE public.blind_shift_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blind_shift_counts_select" ON public.blind_shift_counts;
CREATE POLICY "blind_shift_counts_select"
  ON public.blind_shift_counts FOR SELECT TO authenticated
  USING (
    venue_id = public.get_user_venue_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'gerencia'::app_role)
      OR signed_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "blind_shift_counts_no_direct_insert" ON public.blind_shift_counts;
CREATE POLICY "blind_shift_counts_no_direct_insert"
  ON public.blind_shift_counts FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "blind_shift_counts_admin_update" ON public.blind_shift_counts;
CREATE POLICY "blind_shift_counts_admin_update"
  ON public.blind_shift_counts FOR UPDATE TO authenticated
  USING (
    venue_id = public.get_user_venue_id()
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'gerencia'::app_role))
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.blind_shift_counts;

-- ============================================================
-- 2) is_emergency on replenishment_requests
-- ============================================================
ALTER TABLE public.replenishment_requests
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_replen_req_emergency_pending
  ON public.replenishment_requests(venue_id, created_at DESC)
  WHERE is_emergency = true AND status = 'pending';

-- ============================================================
-- 3) get_shift_consumed_products — only product list, NO quantities
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_shift_consumed_products(
  p_jornada_id UUID,
  p_location_id UUID
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  unit TEXT,
  capacity_ml INTEGER,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id UUID;
BEGIN
  SELECT j.venue_id INTO v_venue_id FROM public.jornadas j WHERE j.id = p_jornada_id;
  IF v_venue_id IS NULL THEN RAISE EXCEPTION 'Jornada no encontrada'; END IF;
  IF v_venue_id <> public.get_user_venue_id() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.name, p.unit, p.capacity_ml, p.category::text
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  WHERE sm.jornada_id = p_jornada_id
    AND sm.from_location_id = p_location_id
    AND sm.movement_type IN ('salida','waste','transfer_out')
  ORDER BY p.name;
END;
$$;

-- ============================================================
-- 4) submit_blind_shift_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_blind_shift_count(
  p_jornada_id UUID,
  p_location_id UUID,
  p_lines JSONB,
  p_threshold_pct NUMERIC DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id UUID;
  v_user UUID := auth.uid();
  v_line JSONB;
  v_product_id UUID;
  v_declared NUMERIC;
  v_theoretical NUMERIC;
  v_variance NUMERIC;
  v_variance_pct NUMERIC;
  v_alert BOOLEAN;
  v_inserted INT := 0;
  v_alerted INT := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT j.venue_id INTO v_venue_id FROM public.jornadas j WHERE j.id = p_jornada_id;
  IF v_venue_id IS NULL THEN RAISE EXCEPTION 'Jornada no encontrada'; END IF;
  IF v_venue_id <> public.get_user_venue_id() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_product_id := (v_line->>'product_id')::UUID;
    v_declared := COALESCE((v_line->>'declared_qty')::NUMERIC, 0);

    SELECT COALESCE(quantity, 0) INTO v_theoretical
      FROM public.stock_balances
      WHERE product_id = v_product_id AND location_id = p_location_id;
    v_theoretical := COALESCE(v_theoretical, 0);

    v_variance := v_declared - v_theoretical;
    v_variance_pct := CASE WHEN v_theoretical = 0 THEN
      CASE WHEN v_declared = 0 THEN 0 ELSE 100 END
      ELSE ABS(v_variance) / v_theoretical * 100 END;
    v_alert := (ABS(v_variance) > 0) AND (v_variance_pct >= p_threshold_pct);

    INSERT INTO public.blind_shift_counts (
      venue_id, jornada_id, location_id, product_id,
      theoretical_qty, declared_qty, variance_qty, variance_pct,
      alerted, signed_by_user_id
    ) VALUES (
      v_venue_id, p_jornada_id, p_location_id, v_product_id,
      v_theoretical, v_declared, v_variance, v_variance_pct,
      v_alert, v_user
    )
    ON CONFLICT (jornada_id, location_id, product_id) DO UPDATE SET
      declared_qty = EXCLUDED.declared_qty,
      theoretical_qty = EXCLUDED.theoretical_qty,
      variance_qty = EXCLUDED.variance_qty,
      variance_pct = EXCLUDED.variance_pct,
      alerted = EXCLUDED.alerted,
      signed_by_user_id = EXCLUDED.signed_by_user_id,
      signed_at = now(),
      admin_decision = 'pending';

    v_inserted := v_inserted + 1;
    IF v_alert THEN v_alerted := v_alerted + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('accepted_count', v_inserted, 'alerts_for_admin', v_alerted);
END;
$$;

-- ============================================================
-- 5) admin_resolve_blind_shift_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_blind_shift_count(
  p_count_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL,
  p_manual_qty NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.blind_shift_counts%ROWTYPE;
  v_user UUID := auth.uid();
  v_adjust NUMERIC;
  v_cpp NUMERIC;
BEGIN
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'gerencia'::app_role)) THEN
    RAISE EXCEPTION 'Solo administradores pueden resolver conteos';
  END IF;

  SELECT * INTO v_count FROM public.blind_shift_counts WHERE id = p_count_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conteo no encontrado'; END IF;
  IF v_count.venue_id <> public.get_user_venue_id() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  IF v_count.admin_decision <> 'pending' THEN RAISE EXCEPTION 'Conteo ya resuelto'; END IF;

  IF p_decision = 'approved_waste' THEN
    v_adjust := v_count.declared_qty - v_count.theoretical_qty;
    SELECT COALESCE(cost_per_unit, 0) INTO v_cpp FROM public.products WHERE id = v_count.product_id;

    UPDATE public.stock_balances
      SET quantity = v_count.declared_qty, updated_at = now()
      WHERE product_id = v_count.product_id AND location_id = v_count.location_id;

    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, notes, jornada_id,
      from_location_id, venue_id, source_type, unit_cost
    ) VALUES (
      v_count.product_id,
      CASE WHEN v_adjust < 0 THEN 'waste'::movement_type ELSE 'ajuste'::movement_type END,
      ABS(v_adjust),
      'Conteo de cierre — ' || COALESCE(p_notes,'aprobado'),
      v_count.jornada_id, v_count.location_id, v_count.venue_id,
      'shift_count_adjustment', v_cpp
    );

  ELSIF p_decision = 'manual_adjust' THEN
    IF p_manual_qty IS NULL THEN RAISE EXCEPTION 'Cantidad manual requerida'; END IF;
    v_adjust := p_manual_qty - v_count.theoretical_qty;

    UPDATE public.stock_balances
      SET quantity = p_manual_qty, updated_at = now()
      WHERE product_id = v_count.product_id AND location_id = v_count.location_id;

    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, notes, jornada_id,
      from_location_id, venue_id, source_type
    ) VALUES (
      v_count.product_id, 'ajuste'::movement_type, ABS(v_adjust),
      'Ajuste manual admin — ' || COALESCE(p_notes,''),
      v_count.jornada_id, v_count.location_id, v_count.venue_id, 'shift_count_manual'
    );
  END IF;

  UPDATE public.blind_shift_counts SET
    admin_decision = p_decision,
    admin_decision_by = v_user,
    admin_decision_at = now(),
    admin_notes = p_notes
  WHERE id = p_count_id;

  RETURN jsonb_build_object('ok', true, 'decision', p_decision);
END;
$$;

-- ============================================================
-- 6) approve_emergency_request
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_emergency_request(
  p_request_id UUID,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.replenishment_requests%ROWTYPE;
  v_user UUID := auth.uid();
  v_warehouse_id UUID;
  v_warehouse_qty NUMERIC;
  v_cpp NUMERIC;
BEGIN
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'gerencia'::app_role)) THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar emergencias';
  END IF;

  SELECT * INTO v_req FROM public.replenishment_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_req.venue_id <> public.get_user_venue_id() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Solicitud ya procesada'; END IF;

  SELECT id INTO v_warehouse_id FROM public.stock_locations
    WHERE venue_id = v_req.venue_id AND type = 'warehouse' LIMIT 1;
  IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Bodega principal no encontrada'; END IF;

  SELECT COALESCE(quantity,0) INTO v_warehouse_qty FROM public.stock_balances
    WHERE product_id = v_req.product_id AND location_id = v_warehouse_id;
  IF COALESCE(v_warehouse_qty,0) < v_req.requested_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente en bodega (disp: %, req: %)', v_warehouse_qty, v_req.requested_quantity;
  END IF;

  SELECT COALESCE(cost_per_unit,0) INTO v_cpp FROM public.products WHERE id = v_req.product_id;

  UPDATE public.stock_balances
    SET quantity = quantity - v_req.requested_quantity, updated_at = now()
    WHERE product_id = v_req.product_id AND location_id = v_warehouse_id;

  INSERT INTO public.stock_balances (venue_id, product_id, location_id, quantity)
  VALUES (v_req.venue_id, v_req.product_id, v_req.location_id, v_req.requested_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
    SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now();

  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, notes,
    from_location_id, to_location_id, venue_id, source_type, unit_cost
  ) VALUES (
    v_req.product_id, 'transfer_out'::movement_type, v_req.requested_quantity,
    'Emergencia jornada — aprobada' || COALESCE(' · '||p_review_notes,''),
    v_warehouse_id, v_req.location_id, v_req.venue_id, 'emergency_replenishment', v_cpp
  );
  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, notes,
    from_location_id, to_location_id, venue_id, source_type, unit_cost
  ) VALUES (
    v_req.product_id, 'transfer_in'::movement_type, v_req.requested_quantity,
    'Emergencia jornada — aprobada',
    v_warehouse_id, v_req.location_id, v_req.venue_id, 'emergency_replenishment', v_cpp
  );

  UPDATE public.replenishment_requests SET
    status = 'approved',
    reviewed_by_user_id = v_user,
    reviewed_at = now(),
    review_notes = p_review_notes,
    updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 7) reject_emergency_request
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_emergency_request(
  p_request_id UUID,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_venue UUID;
BEGIN
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'gerencia'::app_role)) THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar emergencias';
  END IF;
  SELECT venue_id INTO v_venue FROM public.replenishment_requests WHERE id = p_request_id;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_venue <> public.get_user_venue_id() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  UPDATE public.replenishment_requests SET
    status = 'rejected',
    reviewed_by_user_id = v_user,
    reviewed_at = now(),
    review_notes = p_review_notes,
    updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  RETURN jsonb_build_object('ok', true);
END;
$$;