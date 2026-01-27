-- RPC para limpiar datos transaccionales de cualquier venue (developer only)
CREATE OR REPLACE FUNCTION public.dev_clean_venue_data(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calling_user_id uuid := auth.uid();
  is_dev boolean;
  deleted_sales integer := 0;
  deleted_jornadas integer := 0;
  deleted_tokens integer := 0;
BEGIN
  -- Verificar que el usuario es developer
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = calling_user_id 
    AND role = 'developer'
  ) INTO is_dev;
  
  IF NOT is_dev THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only developers can clean venue data');
  END IF;
  
  -- Verificar que el venue existe
  IF NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venue not found');
  END IF;

  -- Borrar logs de demo
  DELETE FROM demo_event_logs WHERE venue_id = p_venue_id;
  
  -- Borrar pickup_redemptions_log asociados a tokens del venue
  DELETE FROM pickup_redemptions_log WHERE pickup_token_id IN (
    SELECT id FROM pickup_tokens WHERE venue_id = p_venue_id
  );
  
  -- Borrar pickup_tokens
  DELETE FROM pickup_tokens WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS deleted_tokens = ROW_COUNT;
  
  -- Borrar sale_items
  DELETE FROM sale_items WHERE sale_id IN (
    SELECT id FROM sales WHERE venue_id = p_venue_id
  );
  
  -- Borrar sales
  DELETE FROM sales WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS deleted_sales = ROW_COUNT;
  
  -- Borrar ticket_sale_items
  DELETE FROM ticket_sale_items WHERE ticket_sale_id IN (
    SELECT id FROM ticket_sales WHERE venue_id = p_venue_id
  );
  
  -- Borrar ticket_sales
  DELETE FROM ticket_sales WHERE venue_id = p_venue_id;
  
  -- Borrar stock_movements de jornadas del venue
  DELETE FROM stock_movements WHERE jornada_id IN (
    SELECT id FROM jornadas WHERE venue_id = p_venue_id
  );
  
  -- Borrar cash closings/openings
  DELETE FROM jornada_cash_closings WHERE venue_id = p_venue_id;
  DELETE FROM jornada_cash_openings WHERE venue_id = p_venue_id;
  DELETE FROM jornada_financial_summary WHERE venue_id = p_venue_id;
  
  -- Borrar expenses
  DELETE FROM expenses WHERE venue_id = p_venue_id;
  
  -- Borrar gross income entries
  DELETE FROM gross_income_entries WHERE venue_id = p_venue_id;
  
  -- Borrar jornadas
  DELETE FROM jornadas WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS deleted_jornadas = ROW_COUNT;
  
  -- Borrar notification logs
  DELETE FROM notification_logs WHERE venue_id = p_venue_id;
  
  -- Borrar login attempts
  DELETE FROM login_attempts WHERE venue_id = p_venue_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'deleted_sales', deleted_sales,
    'deleted_jornadas', deleted_jornadas,
    'deleted_tokens', deleted_tokens
  );
END;
$$;