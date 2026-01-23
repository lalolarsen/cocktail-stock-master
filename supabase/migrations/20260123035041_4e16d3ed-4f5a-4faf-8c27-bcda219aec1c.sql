-- Step 1: Drop the old check constraint that limits numero_jornada to 1-7
ALTER TABLE public.jornadas DROP CONSTRAINT IF EXISTS jornadas_numero_jornada_check;

-- Step 2: Add a new check constraint that only requires numero_jornada >= 1
ALTER TABLE public.jornadas ADD CONSTRAINT jornadas_numero_jornada_check CHECK (numero_jornada >= 1);

-- Step 3: Add unique constraint on (venue_id, numero_jornada) to prevent duplicates per venue
-- First drop if exists
ALTER TABLE public.jornadas DROP CONSTRAINT IF EXISTS jornadas_venue_numero_unique;
-- Create the unique constraint
ALTER TABLE public.jornadas ADD CONSTRAINT jornadas_venue_numero_unique UNIQUE (venue_id, numero_jornada);

-- Step 4: Update the open_jornada_manual function to filter by venue_id
CREATE OR REPLACE FUNCTION public.open_jornada_manual(
  p_cash_amounts JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_existing_open UUID;
  v_jornada_id UUID;
  v_week_start DATE;
  v_today DATE;
  v_current_time TEXT;
  v_last_num INTEGER;
  v_pos_entry JSONB;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;
  
  -- Get venue_id from profile
  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User has no venue assigned');
  END IF;
  
  -- Check if there's already an open jornada for this venue
  SELECT id INTO v_existing_open
  FROM public.jornadas
  WHERE venue_id = v_venue_id AND estado = 'activa'
  LIMIT 1;
  
  IF v_existing_open IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada activa', 'jornada_id', v_existing_open);
  END IF;
  
  -- Calculate dates using proper DATE types
  v_today := CURRENT_DATE;
  v_current_time := TO_CHAR(NOW(), 'HH24:MI');
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  
  -- Get next jornada number for this venue (global per venue, not per week)
  -- This ensures numero_jornada is always >= 1 and increments properly
  SELECT COALESCE(MAX(numero_jornada), 0) INTO v_last_num
  FROM public.jornadas
  WHERE venue_id = v_venue_id;
  
  -- Create jornada as OPEN
  INSERT INTO public.jornadas (
    numero_jornada,
    semana_inicio,
    fecha,
    hora_apertura,
    estado,
    venue_id
  ) VALUES (
    v_last_num + 1,
    v_week_start,
    v_today,
    v_current_time::TIME,
    'activa',
    v_venue_id
  ) RETURNING id INTO v_jornada_id;
  
  -- Insert cash opening records for each POS
  IF jsonb_array_length(p_cash_amounts) > 0 THEN
    FOR v_pos_entry IN SELECT * FROM jsonb_array_elements(p_cash_amounts)
    LOOP
      INSERT INTO public.jornada_cash_openings (
        jornada_id,
        pos_id,
        opening_cash_amount,
        venue_id,
        created_by
      ) VALUES (
        v_jornada_id,
        (v_pos_entry->>'pos_id')::UUID,
        COALESCE((v_pos_entry->>'amount')::NUMERIC, 0),
        v_venue_id,
        v_user_id
      );
    END LOOP;
  END IF;
  
  -- Log the action
  INSERT INTO public.jornada_audit_log (
    jornada_id,
    venue_id,
    actor_user_id,
    actor_source,
    action,
    meta
  ) VALUES (
    v_jornada_id,
    v_venue_id,
    v_user_id,
    'ui',
    'opened',
    jsonb_build_object(
      'opened_at', NOW(),
      'cash_amounts', p_cash_amounts
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'jornada_id', v_jornada_id,
    'numero_jornada', v_last_num + 1
  );
END;
$$;