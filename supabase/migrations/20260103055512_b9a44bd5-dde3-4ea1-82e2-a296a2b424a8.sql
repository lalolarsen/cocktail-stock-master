-- Update seed_demo_data to also handle demo user creation tracking
-- Note: Actual user creation happens via edge function since auth.users requires Admin API

-- Update reset_demo_data to preserve demo users
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_id UUID;
  v_jornada_id UUID;
  v_warehouse_id UUID;
  v_bar1_id UUID;
  v_bar2_id UUID;
BEGIN
  -- Get demo venue
  SELECT id INTO v_venue_id FROM venues WHERE is_demo = true LIMIT 1;
  
  IF v_venue_id IS NULL THEN
    -- No demo to reset, create new
    RETURN seed_demo_data();
  END IF;

  -- Get location IDs
  SELECT id INTO v_warehouse_id FROM stock_locations WHERE venue_id = v_venue_id AND type = 'warehouse' LIMIT 1;
  SELECT id INTO v_bar1_id FROM stock_locations WHERE venue_id = v_venue_id AND type = 'bar' ORDER BY name LIMIT 1;
  SELECT id INTO v_bar2_id FROM stock_locations WHERE venue_id = v_venue_id AND type = 'bar' ORDER BY name OFFSET 1 LIMIT 1;

  -- Delete operational data (keep users, products, cocktails, locations, POS)
  DELETE FROM pickup_redemptions_log WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM pickup_tokens WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sales_documents WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sales WHERE venue_id = v_venue_id;
  DELETE FROM stock_movements WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id));
  DELETE FROM stock_transfers WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM expenses WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM cash_registers WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM notification_logs WHERE venue_id = v_venue_id;
  DELETE FROM stock_alerts WHERE product_id IN (SELECT id FROM products WHERE venue_id = v_venue_id);
  DELETE FROM replenishment_plan_items WHERE replenishment_plan_id IN (SELECT id FROM replenishment_plans WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id));
  DELETE FROM replenishment_plans WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM jornadas WHERE venue_id = v_venue_id;

  -- Reset stock balances to initial values
  UPDATE stock_balances sb
  SET quantity = p.current_stock, updated_at = now()
  FROM products p
  WHERE sb.product_id = p.id AND sb.location_id = v_warehouse_id AND p.venue_id = v_venue_id;

  -- Reset bar stock balances
  UPDATE stock_balances sb
  SET quantity = p.current_stock * 0.3, updated_at = now()
  FROM products p
  WHERE sb.product_id = p.id AND sb.location_id = v_bar1_id AND p.venue_id = v_venue_id;

  UPDATE stock_balances sb
  SET quantity = p.current_stock * 0.2, updated_at = now()
  FROM products p
  WHERE sb.product_id = p.id AND sb.location_id = v_bar2_id AND p.venue_id = v_venue_id;

  -- Create fresh active jornada
  INSERT INTO jornadas (numero_jornada, semana_inicio, fecha, hora_apertura, estado, venue_id)
  VALUES (1, CURRENT_DATE, CURRENT_DATE, CURRENT_TIME, 'activa', v_venue_id)
  RETURNING id INTO v_jornada_id;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', v_venue_id,
    'jornada_id', v_jornada_id,
    'message', 'Demo data reset successfully'
  );
END;
$function$;