DROP FUNCTION IF EXISTS public.open_jornada_manual(jsonb);

CREATE OR REPLACE FUNCTION public.open_jornada_manual(
  p_cash_amounts jsonb DEFAULT '[]'::jsonb,
  p_nombre text DEFAULT ''::text
)
RETURNS jsonb
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
  v_final_nombre TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;
  
  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User has no venue assigned');
  END IF;
  
  SELECT id INTO v_existing_open
  FROM public.jornadas
  WHERE venue_id = v_venue_id AND estado = 'activa'
  LIMIT 1;
  
  IF v_existing_open IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada activa', 'jornada_id', v_existing_open);
  END IF;
  
  v_today := CURRENT_DATE;
  v_current_time := TO_CHAR(NOW(), 'HH24:MI');
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  
  SELECT COALESCE(MAX(numero_jornada), 0) INTO v_last_num
  FROM public.jornadas
  WHERE venue_id = v_venue_id;
  
  v_final_nombre := NULLIF(TRIM(p_nombre), '');
  IF v_final_nombre IS NULL THEN
    v_final_nombre := 'Jornada ' || (v_last_num + 1);
  END IF;
  
  INSERT INTO public.jornadas (
    numero_jornada,
    semana_inicio,
    fecha,
    hora_apertura,
    estado,
    venue_id,
    nombre
  ) VALUES (
    v_last_num + 1,
    v_week_start,
    v_today,
    v_current_time::TIME,
    'activa',
    v_venue_id,
    v_final_nombre
  ) RETURNING id INTO v_jornada_id;
  
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
      'cash_amounts', p_cash_amounts,
      'nombre', v_final_nombre
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'jornada_id', v_jornada_id,
    'numero_jornada', v_last_num + 1
  );
END;
$$;