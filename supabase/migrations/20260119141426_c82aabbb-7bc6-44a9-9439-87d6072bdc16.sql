-- 1) Ensure only one active jornada per venue with a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_jornadas_one_active_per_venue 
ON public.jornadas (venue_id) 
WHERE estado = 'activa';

-- 2) Create jornada_cash_openings table for cash float per POS
CREATE TABLE IF NOT EXISTS public.jornada_cash_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE CASCADE,
  pos_id UUID NOT NULL REFERENCES public.pos_terminals(id) ON DELETE CASCADE,
  opening_cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(jornada_id, pos_id)
);

-- 3) Enable RLS on jornada_cash_openings
ALTER TABLE public.jornada_cash_openings ENABLE ROW LEVEL SECURITY;

-- 4) RLS policies for jornada_cash_openings
CREATE POLICY "Admins can manage cash openings"
ON public.jornada_cash_openings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view cash openings"
ON public.jornada_cash_openings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 5) Create jornada_cash_settings table for cash opening mode config
CREATE TABLE IF NOT EXISTS public.jornada_cash_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  cash_opening_mode TEXT NOT NULL DEFAULT 'prompt' CHECK (cash_opening_mode IN ('prompt', 'auto')),
  default_opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(venue_id)
);

-- 6) Enable RLS on jornada_cash_settings
ALTER TABLE public.jornada_cash_settings ENABLE ROW LEVEL SECURITY;

-- 7) RLS policies for jornada_cash_settings
CREATE POLICY "Admins can manage cash settings"
ON public.jornada_cash_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view cash settings"
ON public.jornada_cash_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 8) Create per-POS default amounts table
CREATE TABLE IF NOT EXISTS public.jornada_cash_pos_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  pos_id UUID NOT NULL REFERENCES public.pos_terminals(id) ON DELETE CASCADE,
  default_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(venue_id, pos_id)
);

-- 9) Enable RLS on jornada_cash_pos_defaults
ALTER TABLE public.jornada_cash_pos_defaults ENABLE ROW LEVEL SECURITY;

-- 10) RLS policies for jornada_cash_pos_defaults
CREATE POLICY "Admins can manage pos defaults"
ON public.jornada_cash_pos_defaults
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view pos defaults"
ON public.jornada_cash_pos_defaults
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 11) Create idempotent start_jornada_with_cash function
CREATE OR REPLACE FUNCTION public.start_jornada_with_cash(
  p_jornada_id UUID,
  p_cash_amounts JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_active UUID;
  v_jornada_estado TEXT;
  v_venue_id UUID;
  v_cash_item JSONB;
BEGIN
  -- Get current active jornada for this venue
  SELECT id INTO v_current_active
  FROM jornadas
  WHERE estado = 'activa'
  LIMIT 1;
  
  -- Get the jornada details
  SELECT estado, venue_id INTO v_jornada_estado, v_venue_id
  FROM jornadas
  WHERE id = p_jornada_id;
  
  IF v_jornada_estado IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada');
  END IF;
  
  -- If this jornada is already active, return success (idempotent)
  IF v_jornada_estado = 'activa' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Jornada ya estaba activa', 'jornada_id', p_jornada_id);
  END IF;
  
  -- Close any currently active jornada first
  IF v_current_active IS NOT NULL AND v_current_active != p_jornada_id THEN
    UPDATE jornadas
    SET estado = 'cerrada', hora_cierre = to_char(now(), 'HH24:MI')
    WHERE id = v_current_active;
  END IF;
  
  -- Activate the target jornada
  UPDATE jornadas
  SET estado = 'activa', hora_apertura = to_char(now(), 'HH24:MI')
  WHERE id = p_jornada_id;
  
  -- Insert cash opening amounts for each POS
  FOR v_cash_item IN SELECT * FROM jsonb_array_elements(p_cash_amounts)
  LOOP
    INSERT INTO jornada_cash_openings (venue_id, jornada_id, pos_id, opening_cash_amount, created_by)
    VALUES (
      v_venue_id,
      p_jornada_id,
      (v_cash_item->>'pos_id')::UUID,
      COALESCE((v_cash_item->>'amount')::NUMERIC, 0),
      auth.uid()
    )
    ON CONFLICT (jornada_id, pos_id) DO UPDATE
    SET opening_cash_amount = EXCLUDED.opening_cash_amount,
        created_by = EXCLUDED.created_by;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'jornada_id', p_jornada_id);
END;
$$;