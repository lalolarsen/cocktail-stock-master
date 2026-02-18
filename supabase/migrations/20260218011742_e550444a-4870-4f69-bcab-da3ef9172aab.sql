
-- ============================================================
-- 1) Fix deduct_open_bottles: bottles_used debe ser array jsonb
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_open_bottles(
  p_location_id    uuid,
  p_product_id     uuid,
  p_venue_id       uuid,
  p_ml_to_deduct   numeric,
  p_actor_user_id  uuid,
  p_token_id       uuid  DEFAULT NULL,
  p_reason         text  DEFAULT 'Canje QR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining    numeric := p_ml_to_deduct;
  v_bottles_used jsonb   := '[]'::jsonb;
  v_bottle       RECORD;
  v_deduct       numeric;
BEGIN
  -- FIFO: botella más antigua primero
  FOR v_bottle IN
    SELECT id, remaining_ml
    FROM   open_bottles
    WHERE  location_id = p_location_id
      AND  product_id  = p_product_id
      AND  venue_id    = p_venue_id
      AND  status      = 'OPEN'
    ORDER BY opened_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct := LEAST(v_bottle.remaining_ml, v_remaining);

    UPDATE open_bottles
    SET
      remaining_ml = remaining_ml - v_deduct,
      status       = CASE WHEN remaining_ml - v_deduct <= 0 THEN 'CLOSED' ELSE 'OPEN' END,
      updated_at   = NOW()
    WHERE id = v_bottle.id;

    INSERT INTO open_bottle_events (
      open_bottle_id, event_type, related_token_id,
      delta_ml, before_ml, after_ml,
      actor_user_id, reason
    ) VALUES (
      v_bottle.id, 'REDEEM_DEDUCT', p_token_id,
      -v_deduct, v_bottle.remaining_ml, v_bottle.remaining_ml - v_deduct,
      p_actor_user_id, p_reason
    );

    -- FIX: usar jsonb_build_array para concatenar correctamente al array
    v_bottles_used := v_bottles_used || jsonb_build_array(
      jsonb_build_object(
        'bottle_id',    v_bottle.id,
        'deducted_ml',  v_deduct
      )
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  RETURN jsonb_build_object(
    'success',       true,
    'deducted_ml',   p_ml_to_deduct - v_remaining,
    'missing_ml',    v_remaining,
    'bottles_used',  v_bottles_used
  );
END;
$$;

-- ============================================================
-- 2) RLS mínimo para open_bottles y open_bottle_events
--    MVP Berlín: authenticated users, venue_id filtrado en queries
-- ============================================================

-- open_bottles
ALTER TABLE public.open_bottles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_bottles_select"        ON public.open_bottles;
DROP POLICY IF EXISTS "open_bottles_insert"        ON public.open_bottles;
DROP POLICY IF EXISTS "open_bottles_update"        ON public.open_bottles;
DROP POLICY IF EXISTS "open_bottles_authenticated" ON public.open_bottles;

CREATE POLICY "open_bottles_select" ON public.open_bottles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "open_bottles_insert" ON public.open_bottles
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "open_bottles_update" ON public.open_bottles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- open_bottle_events
ALTER TABLE public.open_bottle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_bottle_events_select"        ON public.open_bottle_events;
DROP POLICY IF EXISTS "open_bottle_events_insert"        ON public.open_bottle_events;
DROP POLICY IF EXISTS "open_bottle_events_authenticated" ON public.open_bottle_events;

CREATE POLICY "open_bottle_events_select" ON public.open_bottle_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "open_bottle_events_insert" ON public.open_bottle_events
  FOR INSERT TO authenticated WITH CHECK (true);
