
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
  v_hora time;
  v_user_id uuid;
  v_item jsonb;
  v_nombre text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT venue_id INTO v_venue_id FROM profiles WHERE id = v_user_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sin venue asignado');
  END IF;

  v_today := (now() AT TIME ZONE 'America/Santiago')::date;

  SELECT id INTO v_existing_id FROM jornadas
    WHERE venue_id = v_venue_id AND estado = 'activa' AND fecha = v_today LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada activa hoy');
  END IF;

  SELECT COALESCE(MAX(numero_jornada), 0) + 1 INTO v_next_numero
    FROM jornadas WHERE venue_id = v_venue_id;

  v_week_start := v_today - ((EXTRACT(ISODOW FROM v_today) - 1)::integer);
  v_hora := (now() AT TIME ZONE 'America/Santiago')::time;

  v_nombre := NULLIF(TRIM(p_nombre), '');
  IF v_nombre IS NULL THEN
    v_nombre := 'Jornada ' || v_next_numero;
  END IF;

  INSERT INTO jornadas (venue_id, numero_jornada, semana_inicio, fecha, hora_apertura, estado, nombre)
  VALUES (v_venue_id, v_next_numero, v_week_start, v_today, v_hora, 'activa', v_nombre)
  RETURNING id INTO v_jornada_id;

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

  INSERT INTO jornada_audit_log (jornada_id, venue_id, actor_user_id, actor_source, action, meta)
  VALUES (v_jornada_id, v_venue_id, v_user_id, 'ui', 'opened', jsonb_build_object('numero', v_next_numero, 'cash_amounts', p_cash_amounts));

  RETURN jsonb_build_object('success', true, 'jornada_id', v_jornada_id, 'numero_jornada', v_next_numero);
END;
$$;
