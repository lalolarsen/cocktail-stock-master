-- PASO A: Crear venue Demo DiStock si no existe
INSERT INTO venues (name, slug, is_demo, is_active, plan_type)
VALUES ('Demo DiStock', 'demo-distock', true, true, 'demo')
ON CONFLICT (slug) DO UPDATE SET is_demo = true;

-- Actualizar Berlín para que NO sea demo
UPDATE venues SET is_demo = false WHERE slug = 'berlin-valdivia';

-- PASO B: Reescribir seed_demo_data para usar SOLO demo-distock
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_venue_id uuid;
  demo_jornada_id uuid;
  demo_location_id uuid;
  demo_pos_id uuid;
BEGIN
  -- Buscar o crear el venue demo
  SELECT id INTO demo_venue_id FROM venues WHERE slug = 'demo-distock';
  
  IF demo_venue_id IS NULL THEN
    INSERT INTO venues (name, slug, is_demo, is_active, plan_type)
    VALUES ('Demo DiStock', 'demo-distock', true, true, 'demo')
    RETURNING id INTO demo_venue_id;
  END IF;
  
  -- Crear ubicación demo si no existe
  INSERT INTO stock_locations (name, location_type, venue_id)
  VALUES ('Bar Principal Demo', 'bar', demo_venue_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO demo_location_id;
  
  IF demo_location_id IS NULL THEN
    SELECT id INTO demo_location_id FROM stock_locations 
    WHERE venue_id = demo_venue_id AND location_type = 'bar' LIMIT 1;
  END IF;
  
  -- Crear POS demo si no existe
  IF demo_location_id IS NOT NULL THEN
    INSERT INTO pos_terminals (name, location_id, venue_id, pos_type, is_cash_register)
    VALUES ('POS Demo', demo_location_id, demo_venue_id, 'alcohol_sales', true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO demo_pos_id;
    
    IF demo_pos_id IS NULL THEN
      SELECT id INTO demo_pos_id FROM pos_terminals 
      WHERE venue_id = demo_venue_id LIMIT 1;
    END IF;
  END IF;
  
  -- Crear jornada demo
  INSERT INTO jornadas (numero_jornada, semana_inicio, fecha, estado, venue_id, hora_apertura)
  VALUES (1, CURRENT_DATE, CURRENT_DATE, 'abierta', demo_venue_id, CURRENT_TIME)
  RETURNING id INTO demo_jornada_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'venue_id', demo_venue_id,
    'jornada_id', demo_jornada_id,
    'message', 'Demo data seeded successfully'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- PASO B: Reescribir reset_demo_data para limpiar SOLO demo-distock
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_venue_id uuid;
BEGIN
  -- Obtener venue demo por slug
  SELECT id INTO demo_venue_id FROM venues WHERE slug = 'demo-distock';
  
  IF demo_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Demo venue not found');
  END IF;
  
  -- Borrar datos operacionales SOLO del venue demo
  DELETE FROM demo_event_logs WHERE venue_id = demo_venue_id;
  DELETE FROM pickup_redemptions_log WHERE pickup_token_id IN (
    SELECT id FROM pickup_tokens WHERE venue_id = demo_venue_id
  );
  DELETE FROM pickup_tokens WHERE venue_id = demo_venue_id;
  DELETE FROM sale_items WHERE sale_id IN (
    SELECT id FROM sales WHERE venue_id = demo_venue_id
  );
  DELETE FROM sales WHERE venue_id = demo_venue_id;
  DELETE FROM ticket_sale_items WHERE ticket_sale_id IN (
    SELECT id FROM ticket_sales WHERE venue_id = demo_venue_id
  );
  DELETE FROM ticket_sales WHERE venue_id = demo_venue_id;
  DELETE FROM stock_movements WHERE jornada_id IN (
    SELECT id FROM jornadas WHERE venue_id = demo_venue_id
  );
  DELETE FROM jornada_cash_closings WHERE venue_id = demo_venue_id;
  DELETE FROM jornada_cash_openings WHERE venue_id = demo_venue_id;
  DELETE FROM jornada_financial_summary WHERE venue_id = demo_venue_id;
  DELETE FROM expenses WHERE venue_id = demo_venue_id;
  DELETE FROM jornadas WHERE venue_id = demo_venue_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Demo data reset successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- PASO C: Función para limpiar Berlín de datos demo (ejecutar una vez)
CREATE OR REPLACE FUNCTION public.clean_berlin_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  berlin_venue_id uuid := '4e128e76-980d-4233-a438-92aa02cfb50b';
  deleted_sales int := 0;
  deleted_tokens int := 0;
  deleted_jornadas int := 0;
BEGIN
  -- Borrar logs de demo
  DELETE FROM demo_event_logs WHERE venue_id = berlin_venue_id;
  
  -- Borrar pickup_redemptions_log asociados a tokens de Berlín
  DELETE FROM pickup_redemptions_log WHERE pickup_token_id IN (
    SELECT id FROM pickup_tokens WHERE venue_id = berlin_venue_id
  );
  
  -- Borrar pickup_tokens
  DELETE FROM pickup_tokens WHERE venue_id = berlin_venue_id;
  GET DIAGNOSTICS deleted_tokens = ROW_COUNT;
  
  -- Borrar sale_items
  DELETE FROM sale_items WHERE sale_id IN (
    SELECT id FROM sales WHERE venue_id = berlin_venue_id
  );
  
  -- Borrar sales
  DELETE FROM sales WHERE venue_id = berlin_venue_id;
  GET DIAGNOSTICS deleted_sales = ROW_COUNT;
  
  -- Borrar ticket_sale_items
  DELETE FROM ticket_sale_items WHERE ticket_sale_id IN (
    SELECT id FROM ticket_sales WHERE venue_id = berlin_venue_id
  );
  
  -- Borrar ticket_sales
  DELETE FROM ticket_sales WHERE venue_id = berlin_venue_id;
  
  -- Borrar stock_movements de jornadas de Berlín
  DELETE FROM stock_movements WHERE jornada_id IN (
    SELECT id FROM jornadas WHERE venue_id = berlin_venue_id
  );
  
  -- Borrar cash closings/openings
  DELETE FROM jornada_cash_closings WHERE venue_id = berlin_venue_id;
  DELETE FROM jornada_cash_openings WHERE venue_id = berlin_venue_id;
  DELETE FROM jornada_financial_summary WHERE venue_id = berlin_venue_id;
  
  -- Borrar expenses
  DELETE FROM expenses WHERE venue_id = berlin_venue_id;
  
  -- Borrar jornadas
  DELETE FROM jornadas WHERE venue_id = berlin_venue_id;
  GET DIAGNOSTICS deleted_jornadas = ROW_COUNT;
  
  -- Borrar usuarios DEMO de Berlín (rut_code empieza con DEMO- o email tiene demo)
  -- Solo de profiles, no de auth.users (eso requiere service role)
  DELETE FROM worker_roles WHERE worker_id IN (
    SELECT id FROM profiles 
    WHERE venue_id = berlin_venue_id 
    AND (rut_code LIKE 'DEMO-%' OR internal_email LIKE '%demo%' OR email LIKE '%@demo.local')
  );
  
  DELETE FROM profiles 
  WHERE venue_id = berlin_venue_id 
  AND (rut_code LIKE 'DEMO-%' OR internal_email LIKE '%demo%' OR email LIKE '%@demo.local');
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_sales', deleted_sales,
    'deleted_tokens', deleted_tokens,
    'deleted_jornadas', deleted_jornadas,
    'message', 'Berlin cleaned of demo data'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;