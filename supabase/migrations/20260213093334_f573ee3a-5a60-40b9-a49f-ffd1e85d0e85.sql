
-- Add nombre column to jornadas
ALTER TABLE public.jornadas ADD COLUMN nombre text;

-- Backfill existing jornadas with auto-generated names
UPDATE public.jornadas SET nombre = 'Jornada ' || numero_jornada WHERE nombre IS NULL;

-- Make nombre NOT NULL after backfill
ALTER TABLE public.jornadas ALTER COLUMN nombre SET NOT NULL;
ALTER TABLE public.jornadas ALTER COLUMN nombre SET DEFAULT '';

-- Update open_jornada_manual to accept p_nombre
CREATE OR REPLACE FUNCTION public.open_jornada_manual(
  p_cash_amounts jsonb,
  p_nombre text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_today date;
  v_existing_id uuid;
  v_next_numero integer;
  v_week_start date;
  v_jornada_id uuid;
  v_hora text;
  v_user_id uuid;
  v_item jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get venue
  SELECT venue_id INTO v_venue_id FROM profiles WHERE id = v_user_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sin venue asignado');
  END IF;

  -- Today in Santiago
  v_today := (now() AT TIME ZONE 'America/Santiago')::date;

  -- Check no active jornada today
  SELECT id INTO v_existing_id FROM jornadas
    WHERE venue_id = v_venue_id AND estado = 'activa' AND fecha = v_today LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada activa hoy');
  END IF;

  -- Next numero
  SELECT COALESCE(MAX(numero_jornada), 0) + 1 INTO v_next_numero
    FROM jornadas WHERE venue_id = v_venue_id;

  -- Week start (Monday)
  v_week_start := v_today - ((EXTRACT(ISODOW FROM v_today) - 1)::integer);

  -- Current time
  v_hora := to_char(now() AT TIME ZONE 'America/Santiago', 'HH24:MI:SS');

  -- Use provided name or auto-generate
  DECLARE
    v_nombre text;
  BEGIN
    v_nombre := NULLIF(TRIM(p_nombre), '');
    IF v_nombre IS NULL THEN
      v_nombre := 'Jornada ' || v_next_numero;
    END IF;

    -- Insert jornada
    INSERT INTO jornadas (venue_id, numero_jornada, semana_inicio, fecha, hora_apertura, estado, nombre)
    VALUES (v_venue_id, v_next_numero, v_week_start, v_today, v_hora, 'activa', v_nombre)
    RETURNING id INTO v_jornada_id;
  END;

  -- Insert cash openings
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cash_amounts)
  LOOP
    INSERT INTO jornada_cash_openings (jornada_id, pos_id, opening_cash_amount, venue_id, created_by)
    VALUES (
      v_jornada_id,
      (v_item->>'pos_id')::uuid,
      COALESCE((v_item->>'amount')::numeric, 0),
      v_venue_id,
      v_user_id
    );
  END LOOP;

  -- Audit log
  INSERT INTO jornada_audit_log (jornada_id, venue_id, actor_user_id, actor_source, action, meta)
  VALUES (v_jornada_id, v_venue_id, v_user_id, 'ui', 'open', jsonb_build_object('numero', v_next_numero, 'cash_amounts', p_cash_amounts));

  RETURN jsonb_build_object('success', true, 'jornada_id', v_jornada_id, 'numero_jornada', v_next_numero);
END;
$$;
