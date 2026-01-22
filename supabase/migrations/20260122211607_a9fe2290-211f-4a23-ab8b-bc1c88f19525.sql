-- Simplify jornadas to manual-only v1: Only OPEN and CLOSED states
-- Step 1: Convert any existing 'pendiente' jornadas to 'cerrada' (they were never opened)
UPDATE public.jornadas 
SET estado = 'cerrada' 
WHERE estado = 'pendiente';

-- Step 2: Create a function to check for existing OPEN jornada before creating new one
CREATE OR REPLACE FUNCTION public.check_single_open_jornada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- Only check when inserting as 'activa' or updating to 'activa'
  IF NEW.estado = 'activa' THEN
    SELECT COUNT(*) INTO existing_count
    FROM public.jornadas
    WHERE estado = 'activa'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND venue_id IS NOT DISTINCT FROM NEW.venue_id;
    
    IF existing_count > 0 THEN
      RAISE EXCEPTION 'Ya existe una jornada abierta para este venue. Ciérrela antes de abrir una nueva.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 3: Create trigger to enforce single open jornada
DROP TRIGGER IF EXISTS enforce_single_open_jornada ON public.jornadas;
CREATE TRIGGER enforce_single_open_jornada
  BEFORE INSERT OR UPDATE OF estado ON public.jornadas
  FOR EACH ROW
  EXECUTE FUNCTION public.check_single_open_jornada();

-- Step 4: Create simplified open jornada function (admin only)
CREATE OR REPLACE FUNCTION public.open_jornada_manual(
  p_opening_cash_amounts JSONB DEFAULT '[]'::jsonb
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
  v_week_start TEXT;
  v_today TEXT;
  v_current_time TEXT;
  v_last_num INTEGER;
  v_pos_entry JSONB;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get user's venue
  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  
  -- Check for existing open jornada
  SELECT id INTO v_existing_open
  FROM public.jornadas
  WHERE estado = 'activa'
  AND venue_id IS NOT DISTINCT FROM v_venue_id
  LIMIT 1;
  
  IF v_existing_open IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una jornada abierta', 'jornada_id', v_existing_open);
  END IF;
  
  -- Calculate dates
  v_today := CURRENT_DATE::TEXT;
  v_current_time := TO_CHAR(NOW(), 'HH24:MI');
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE::TEXT;
  
  -- Get next jornada number for this week
  SELECT COALESCE(MAX(numero_jornada), 0) INTO v_last_num
  FROM public.jornadas
  WHERE semana_inicio = v_week_start;
  
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
    v_current_time,
    'activa',
    v_venue_id
  )
  RETURNING id INTO v_jornada_id;
  
  -- Insert opening cash for each POS
  FOR v_pos_entry IN SELECT * FROM jsonb_array_elements(p_opening_cash_amounts)
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
  
  -- Log audit
  INSERT INTO public.jornada_audit_log (
    jornada_id,
    venue_id,
    actor_user_id,
    actor_source,
    action,
    reason
  ) VALUES (
    v_jornada_id,
    v_venue_id,
    v_user_id,
    'ui',
    'opened',
    'Jornada abierta manualmente por admin'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'jornada_id', v_jornada_id,
    'numero_jornada', v_last_num + 1
  );
END;
$$;

-- Step 5: Create simplified close jornada function (admin only, requires reconciliation)
CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id UUID,
  p_cash_closings JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_jornada RECORD;
  v_pos_entry JSONB;
  v_opening_cash NUMERIC;
  v_cash_sales NUMERIC;
  v_expected_cash NUMERIC;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get jornada
  SELECT * INTO v_jornada FROM public.jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada');
  END IF;
  
  IF v_jornada.estado != 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está abierta');
  END IF;
  
  v_venue_id := v_jornada.venue_id;
  
  -- Process cash closings for each POS
  FOR v_pos_entry IN SELECT * FROM jsonb_array_elements(p_cash_closings)
  LOOP
    -- Get opening cash for this POS
    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM public.jornada_cash_openings
    WHERE jornada_id = p_jornada_id
    AND pos_id = (v_pos_entry->>'pos_id')::UUID;
    
    -- Get cash sales for this POS
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
    FROM public.sales
    WHERE jornada_id = p_jornada_id
    AND pos_id = (v_pos_entry->>'pos_id')::UUID
    AND payment_method = 'cash'
    AND is_cancelled = false;
    
    v_expected_cash := COALESCE(v_opening_cash, 0) + v_cash_sales;
    
    -- Insert or update cash closing
    INSERT INTO public.jornada_cash_closings (
      jornada_id,
      pos_id,
      opening_cash_amount,
      cash_sales_total,
      expected_cash,
      closing_cash_counted,
      difference,
      notes,
      venue_id,
      created_by
    ) VALUES (
      p_jornada_id,
      (v_pos_entry->>'pos_id')::UUID,
      COALESCE(v_opening_cash, 0),
      v_cash_sales,
      v_expected_cash,
      COALESCE((v_pos_entry->>'closing_cash_counted')::NUMERIC, 0),
      COALESCE((v_pos_entry->>'closing_cash_counted')::NUMERIC, 0) - v_expected_cash,
      v_pos_entry->>'notes',
      v_venue_id,
      v_user_id
    )
    ON CONFLICT (jornada_id, pos_id) DO UPDATE SET
      closing_cash_counted = EXCLUDED.closing_cash_counted,
      difference = EXCLUDED.difference,
      notes = EXCLUDED.notes,
      created_by = EXCLUDED.created_by;
  END LOOP;
  
  -- Close the jornada
  UPDATE public.jornadas
  SET estado = 'cerrada',
      hora_cierre = TO_CHAR(NOW(), 'HH24:MI'),
      updated_at = NOW()
  WHERE id = p_jornada_id;
  
  -- Log audit
  INSERT INTO public.jornada_audit_log (
    jornada_id,
    venue_id,
    actor_user_id,
    actor_source,
    action,
    reason
  ) VALUES (
    p_jornada_id,
    v_venue_id,
    v_user_id,
    'ui',
    'closed',
    'Jornada cerrada manualmente por admin'
  );
  
  -- Call financial summary function if it exists
  BEGIN
    PERFORM public.close_jornada_with_summary(p_jornada_id);
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if function doesn't exist or fails
    NULL;
  END;
  
  RETURN jsonb_build_object('success', true, 'jornada_id', p_jornada_id);
END;
$$;

-- Step 6: Create function to get current open jornada (for sales)
CREATE OR REPLACE FUNCTION public.get_open_jornada()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_venue_id UUID;
  v_jornada RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Get user's venue
  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = v_user_id;
  
  -- Get open jornada
  SELECT id, numero_jornada, fecha, hora_apertura, estado
  INTO v_jornada
  FROM public.jornadas
  WHERE estado = 'activa'
  AND venue_id IS NOT DISTINCT FROM v_venue_id
  LIMIT 1;
  
  IF v_jornada.id IS NULL THEN
    RETURN jsonb_build_object('has_open_jornada', false, 'jornada', NULL);
  END IF;
  
  RETURN jsonb_build_object(
    'has_open_jornada', true,
    'jornada', jsonb_build_object(
      'id', v_jornada.id,
      'numero_jornada', v_jornada.numero_jornada,
      'fecha', v_jornada.fecha,
      'hora_apertura', v_jornada.hora_apertura
    )
  );
END;
$$;