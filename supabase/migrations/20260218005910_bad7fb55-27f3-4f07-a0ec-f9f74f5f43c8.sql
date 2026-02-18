
-- ═══════════════════════════════════════════════════
-- open_bottles: control de botellas abiertas por ubicación
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.open_bottles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  location_id         uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id   uuid NOT NULL,
  label_code          text,              -- ej: "B1", "B2" identificación física
  initial_ml          numeric NOT NULL,  -- capacidad total al abrir
  remaining_ml        numeric NOT NULL,  -- ml disponibles actualmente
  last_counted_ml     numeric,
  last_counted_at     timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_bottles_remaining_ml_non_negative CHECK (remaining_ml >= 0)
);

-- ═══════════════════════════════════════════════════
-- open_bottle_events: auditoría de eventos por botella
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.open_bottle_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_bottle_id   uuid NOT NULL REFERENCES public.open_bottles(id) ON DELETE CASCADE,
  event_type       text NOT NULL CHECK (event_type IN ('OPENED', 'REDEEM_DEDUCT', 'MANUAL_ADJUST', 'COUNT', 'CLOSE_BOTTLE')),
  related_token_id uuid,  -- pickup_token_id si viene de QR
  delta_ml         numeric NOT NULL,   -- negativo si descuenta, positivo si ajusta
  before_ml        numeric NOT NULL,
  after_ml         numeric NOT NULL,
  actor_user_id    uuid NOT NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_open_bottles_location_product
  ON public.open_bottles(location_id, product_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_open_bottles_venue_status
  ON public.open_bottles(venue_id, status);

CREATE INDEX IF NOT EXISTS idx_open_bottle_events_bottle
  ON public.open_bottle_events(open_bottle_id, created_at DESC);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.update_open_bottles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_open_bottles_updated_at
  BEFORE UPDATE ON public.open_bottles
  FOR EACH ROW EXECUTE FUNCTION public.update_open_bottles_updated_at();

-- ═══════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════
ALTER TABLE public.open_bottles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_bottle_events ENABLE ROW LEVEL SECURITY;

-- open_bottles: leer propio venue
CREATE POLICY "open_bottles_select" ON public.open_bottles
  FOR SELECT TO authenticated
  USING (true);

-- open_bottles: insertar (bartenders, admins)
CREATE POLICY "open_bottles_insert" ON public.open_bottles
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- open_bottles: actualizar remaining_ml, status
CREATE POLICY "open_bottles_update" ON public.open_bottles
  FOR UPDATE TO authenticated
  USING (true);

-- open_bottle_events: leer
CREATE POLICY "open_bottle_events_select" ON public.open_bottle_events
  FOR SELECT TO authenticated
  USING (true);

-- open_bottle_events: insertar
CREATE POLICY "open_bottle_events_insert" ON public.open_bottle_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- Función helper: descontar ml de botellas abiertas (FIFO)
-- Retorna los IDs de botellas usadas y delta aplicado
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.deduct_open_bottles(
  p_location_id    uuid,
  p_product_id     uuid,
  p_venue_id       uuid,
  p_ml_to_deduct   numeric,
  p_actor_user_id  uuid,
  p_token_id       uuid DEFAULT NULL,
  p_reason         text DEFAULT 'Canje QR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_to_deduct  numeric := p_ml_to_deduct;
  v_bottle               record;
  v_delta                numeric;
  v_bottles_used         jsonb := '[]'::jsonb;
  v_before_ml            numeric;
  v_after_ml             numeric;
BEGIN
  -- Iterate open bottles FIFO (oldest first)
  FOR v_bottle IN
    SELECT id, remaining_ml, label_code
    FROM public.open_bottles
    WHERE location_id = p_location_id
      AND product_id  = p_product_id
      AND venue_id    = p_venue_id
      AND status      = 'OPEN'
      AND remaining_ml > 0
    ORDER BY opened_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_remaining_to_deduct <= 0;

    v_delta := LEAST(v_bottle.remaining_ml, v_remaining_to_deduct);
    v_before_ml := v_bottle.remaining_ml;
    v_after_ml  := v_bottle.remaining_ml - v_delta;

    -- Update bottle
    UPDATE public.open_bottles
    SET remaining_ml = v_after_ml,
        status = CASE WHEN v_after_ml <= 0 THEN 'CLOSED' ELSE 'OPEN' END
    WHERE id = v_bottle.id;

    -- Log event
    INSERT INTO public.open_bottle_events
      (open_bottle_id, event_type, related_token_id, delta_ml, before_ml, after_ml, actor_user_id, reason)
    VALUES
      (v_bottle.id, 'REDEEM_DEDUCT', p_token_id, -v_delta, v_before_ml, v_after_ml, p_actor_user_id, p_reason);

    v_bottles_used := v_bottles_used || jsonb_build_object(
      'bottle_id', v_bottle.id,
      'label_code', v_bottle.label_code,
      'deducted_ml', v_delta,
      'remaining_ml', v_after_ml
    );

    v_remaining_to_deduct := v_remaining_to_deduct - v_delta;
  END LOOP;

  RETURN jsonb_build_object(
    'success',           v_remaining_to_deduct <= 0,
    'deducted_ml',       p_ml_to_deduct - v_remaining_to_deduct,
    'missing_ml',        GREATEST(v_remaining_to_deduct, 0),
    'bottles_used',      v_bottles_used
  );
END;
$$;
