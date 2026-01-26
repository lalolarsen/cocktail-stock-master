-- =============================================
-- VENUE BERLÍN - PILOTO PRINCIPAL
-- =============================================

-- 1) Create the Berlín venue if it doesn't exist
INSERT INTO public.venues (name, slug, plan_type, is_demo, onboarding_completed, max_pos, max_bars)
SELECT 'Berlín Valdivia', 'berlin-valdivia', 'pilot', true, true, 10, 5
WHERE NOT EXISTS (SELECT 1 FROM public.venues WHERE slug = 'berlin-valdivia');

-- 2) If there was an old demo venue, migrate it to Berlín
-- First, get the Berlín venue ID
DO $$
DECLARE
  v_berlin_id UUID;
  v_old_demo_id UUID;
BEGIN
  -- Get Berlín ID
  SELECT id INTO v_berlin_id FROM public.venues WHERE slug = 'berlin-valdivia';
  
  -- Get any other demo venue that's not Berlín
  SELECT id INTO v_old_demo_id FROM public.venues 
  WHERE is_demo = true AND slug != 'berlin-valdivia' 
  LIMIT 1;
  
  -- If there's an old demo venue, mark it as non-demo (Berlín is now the demo)
  IF v_old_demo_id IS NOT NULL THEN
    UPDATE public.venues SET is_demo = false WHERE id = v_old_demo_id;
  END IF;
  
  -- Ensure Berlín is marked as demo/pilot
  UPDATE public.venues SET is_demo = true WHERE id = v_berlin_id;
END $$;

-- 3) Update seed_demo_data to use Berlín venue
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_venue_id UUID;
  v_warehouse_id UUID;
  v_bar1_id UUID;
  v_bar2_id UUID;
  v_pos1_id UUID;
  v_pos2_id UUID;
  v_jornada_id UUID;
  v_product_ids UUID[] := ARRAY[]::UUID[];
  v_cocktail_ids UUID[] := ARRAY[]::UUID[];
  v_user_id UUID;
  i INTEGER;
BEGIN
  -- Check if Berlín venue already exists (primary pilot venue)
  SELECT id INTO v_venue_id FROM venues WHERE slug = 'berlin-valdivia' LIMIT 1;
  
  IF v_venue_id IS NOT NULL THEN
    -- Check if it already has demo data (products exist)
    IF EXISTS (SELECT 1 FROM products WHERE venue_id = v_venue_id LIMIT 1) THEN
      RETURN jsonb_build_object('success', true, 'error', 'Demo venue already exists', 'venue_id', v_venue_id);
    END IF;
  ELSE
    -- Create Berlín venue if somehow missing
    INSERT INTO venues (name, slug, plan_type, is_demo, onboarding_completed, max_pos, max_bars)
    VALUES ('Berlín Valdivia', 'berlin-valdivia', 'pilot', true, true, 10, 5)
    RETURNING id INTO v_venue_id;
  END IF;

  -- Create warehouse if not exists
  SELECT id INTO v_warehouse_id FROM stock_locations WHERE venue_id = v_venue_id AND type = 'warehouse' LIMIT 1;
  IF v_warehouse_id IS NULL THEN
    INSERT INTO stock_locations (name, type, is_active, venue_id)
    VALUES ('Bodega Principal', 'warehouse', true, v_venue_id)
    RETURNING id INTO v_warehouse_id;
  END IF;

  -- Create bars if not exist
  SELECT id INTO v_bar1_id FROM stock_locations WHERE venue_id = v_venue_id AND type = 'bar' AND name = 'Barra Principal' LIMIT 1;
  IF v_bar1_id IS NULL THEN
    INSERT INTO stock_locations (name, type, is_active, venue_id)
    VALUES ('Barra Principal', 'bar', true, v_venue_id)
    RETURNING id INTO v_bar1_id;
  END IF;

  SELECT id INTO v_bar2_id FROM stock_locations WHERE venue_id = v_venue_id AND type = 'bar' AND name = 'Barra Terraza' LIMIT 1;
  IF v_bar2_id IS NULL THEN
    INSERT INTO stock_locations (name, type, is_active, venue_id)
    VALUES ('Barra Terraza', 'bar', true, v_venue_id)
    RETURNING id INTO v_bar2_id;
  END IF;

  -- Create POS terminals if not exist
  SELECT id INTO v_pos1_id FROM pos_terminals WHERE venue_id = v_venue_id AND name = 'Caja Principal' LIMIT 1;
  IF v_pos1_id IS NULL THEN
    INSERT INTO pos_terminals (name, location_id, is_active, is_cash_register, venue_id, pos_type)
    VALUES ('Caja Principal', v_bar1_id, true, true, v_venue_id, 'bar')
    RETURNING id INTO v_pos1_id;
  END IF;

  SELECT id INTO v_pos2_id FROM pos_terminals WHERE venue_id = v_venue_id AND name = 'Caja Terraza' LIMIT 1;
  IF v_pos2_id IS NULL THEN
    INSERT INTO pos_terminals (name, location_id, is_active, is_cash_register, venue_id, pos_type)
    VALUES ('Caja Terraza', v_bar2_id, true, true, v_venue_id, 'bar')
    RETURNING id INTO v_pos2_id;
  END IF;

  -- Create products (only if none exist)
  IF NOT EXISTS (SELECT 1 FROM products WHERE venue_id = v_venue_id LIMIT 1) THEN
    -- Spirits
    INSERT INTO products (name, code, category, unit, cost_per_unit, current_stock, minimum_stock, venue_id)
    VALUES 
      ('Pisco Mistral 35°', 'PISCO-001', 'spirit', 'ml', 0.008, 15000, 3000, v_venue_id),
      ('Vodka Absolut', 'VODKA-001', 'spirit', 'ml', 0.012, 10000, 2000, v_venue_id),
      ('Ron Bacardí Blanco', 'RON-001', 'spirit', 'ml', 0.010, 8000, 2000, v_venue_id),
      ('Gin Beefeater', 'GIN-001', 'spirit', 'ml', 0.015, 6000, 1500, v_venue_id),
      ('Tequila José Cuervo', 'TEQ-001', 'spirit', 'ml', 0.014, 5000, 1000, v_venue_id),
      ('Whisky Johnnie Walker Red', 'WHIS-001', 'spirit', 'ml', 0.018, 4000, 1000, v_venue_id);

    -- Mixers
    INSERT INTO products (name, code, category, unit, cost_per_unit, current_stock, minimum_stock, venue_id)
    VALUES 
      ('Coca-Cola', 'MIX-001', 'mixer', 'ml', 0.001, 20000, 5000, v_venue_id),
      ('Sprite', 'MIX-002', 'mixer', 'ml', 0.001, 15000, 4000, v_venue_id),
      ('Agua Tónica', 'MIX-003', 'mixer', 'ml', 0.002, 10000, 3000, v_venue_id),
      ('Jugo de Limón', 'MIX-004', 'mixer', 'ml', 0.003, 5000, 1000, v_venue_id);
  END IF;

  -- Get product IDs for cocktail ingredients
  SELECT ARRAY_AGG(id ORDER BY code) INTO v_product_ids FROM products WHERE venue_id = v_venue_id;

  -- Create cocktails (only if none exist)
  IF NOT EXISTS (SELECT 1 FROM cocktails WHERE venue_id = v_venue_id LIMIT 1) THEN
    INSERT INTO cocktails (name, category, price, description, venue_id)
    VALUES 
      ('Pisco Sour', 'signature', 5500, 'Clásico chileno con pisco, limón y clara', v_venue_id),
      ('Mojito', 'classic', 5000, 'Ron, menta, limón y soda', v_venue_id),
      ('Gin Tonic', 'classic', 6000, 'Gin premium con tónica', v_venue_id),
      ('Cuba Libre', 'highball', 4500, 'Ron con coca-cola y limón', v_venue_id),
      ('Vodka Tonic', 'highball', 4500, 'Vodka con agua tónica', v_venue_id),
      ('Margarita', 'classic', 5500, 'Tequila, triple sec y limón', v_venue_id),
      ('Whisky Sour', 'classic', 6000, 'Whisky, limón y azúcar', v_venue_id),
      ('Terremoto', 'signature', 4000, 'Pipeño, helado de piña y fernet', v_venue_id);

    -- Get cocktail IDs
    SELECT ARRAY_AGG(id ORDER BY name) INTO v_cocktail_ids FROM cocktails WHERE venue_id = v_venue_id;

    -- Add ingredients to cocktails (simplified - just main spirit + mixer)
    IF array_length(v_cocktail_ids, 1) > 0 AND array_length(v_product_ids, 1) > 0 THEN
      -- Pisco Sour: Pisco + Limón
      INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
      SELECT v_cocktail_ids[6], v_product_ids[1], 60
      WHERE EXISTS (SELECT 1 FROM products WHERE id = v_product_ids[1]);

      -- Mojito: Ron + Sprite
      INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
      SELECT v_cocktail_ids[5], v_product_ids[3], 45
      WHERE EXISTS (SELECT 1 FROM products WHERE id = v_product_ids[3]);

      -- Gin Tonic: Gin + Tónica
      INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
      SELECT v_cocktail_ids[2], v_product_ids[4], 50
      WHERE EXISTS (SELECT 1 FROM products WHERE id = v_product_ids[4]);
    END IF;
  END IF;

  -- Create initial stock balances
  INSERT INTO stock_balances (location_id, product_id, quantity, venue_id)
  SELECT v_warehouse_id, p.id, p.current_stock * 0.7, v_venue_id
  FROM products p
  WHERE p.venue_id = v_venue_id
  AND NOT EXISTS (
    SELECT 1 FROM stock_balances sb 
    WHERE sb.location_id = v_warehouse_id AND sb.product_id = p.id
  );

  INSERT INTO stock_balances (location_id, product_id, quantity, venue_id)
  SELECT v_bar1_id, p.id, p.current_stock * 0.2, v_venue_id
  FROM products p
  WHERE p.venue_id = v_venue_id
  AND NOT EXISTS (
    SELECT 1 FROM stock_balances sb 
    WHERE sb.location_id = v_bar1_id AND sb.product_id = p.id
  );

  INSERT INTO stock_balances (location_id, product_id, quantity, venue_id)
  SELECT v_bar2_id, p.id, p.current_stock * 0.1, v_venue_id
  FROM products p
  WHERE p.venue_id = v_venue_id
  AND NOT EXISTS (
    SELECT 1 FROM stock_balances sb 
    WHERE sb.location_id = v_bar2_id AND sb.product_id = p.id
  );

  -- Create a sample open jornada (only if none exists)
  IF NOT EXISTS (SELECT 1 FROM jornadas WHERE venue_id = v_venue_id AND estado = 'abierta' LIMIT 1) THEN
    INSERT INTO jornadas (fecha, numero_jornada, semana_inicio, estado, hora_apertura, venue_id)
    VALUES (CURRENT_DATE, 1, date_trunc('week', CURRENT_DATE)::date, 'abierta', NOW(), v_venue_id)
    RETURNING id INTO v_jornada_id;
  END IF;

  -- Initialize default feature flags for Berlín
  INSERT INTO developer_feature_flags (venue_id, key, is_enabled)
  SELECT v_venue_id, key, true
  FROM unnest(ARRAY['FEATURE_TICKETS', 'FEATURE_QR_REDEMPTION', 'FEATURE_MULTI_POS', 'FEATURE_INVOICING']) AS key
  WHERE NOT EXISTS (
    SELECT 1 FROM developer_feature_flags df 
    WHERE df.venue_id = v_venue_id AND df.key = key
  )
  ON CONFLICT (venue_id, key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 
    'venue_id', v_venue_id,
    'venue_name', 'Berlín Valdivia',
    'venue_slug', 'berlin-valdivia',
    'warehouse_id', v_warehouse_id,
    'bar1_id', v_bar1_id,
    'bar2_id', v_bar2_id
  );
END;
$function$;

-- 4) Update reset_demo_data to preserve Berlín venue structure
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_venue_id UUID;
BEGIN
  -- Check admin or developer permission
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'developer')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized - admin or developer only');
  END IF;

  -- Get Berlín venue (primary pilot venue)
  SELECT id INTO v_venue_id FROM venues WHERE slug = 'berlin-valdivia' LIMIT 1;
  
  IF v_venue_id IS NULL THEN
    -- Fallback to any demo venue
    SELECT id INTO v_venue_id FROM venues WHERE is_demo = true LIMIT 1;
  END IF;
  
  IF v_venue_id IS NULL THEN
    -- No venue to reset, create new
    RETURN seed_demo_data();
  END IF;

  -- Delete transactional data (respecting foreign keys)
  DELETE FROM stock_movements WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM pickup_redemptions_log WHERE pickup_token_id IN (SELECT id FROM pickup_tokens WHERE venue_id = v_venue_id);
  DELETE FROM pickup_tokens WHERE venue_id = v_venue_id;
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sales_documents WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sales WHERE venue_id = v_venue_id;
  DELETE FROM ticket_sales WHERE venue_id = v_venue_id;
  DELETE FROM jornada_cash_closings WHERE venue_id = v_venue_id;
  DELETE FROM jornada_cash_openings WHERE venue_id = v_venue_id;
  DELETE FROM jornada_financial_summary WHERE venue_id = v_venue_id;
  DELETE FROM cash_registers WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM expenses WHERE venue_id = v_venue_id;
  DELETE FROM jornadas WHERE venue_id = v_venue_id;
  
  -- Delete master data but keep venue structure
  DELETE FROM cocktail_ingredients WHERE cocktail_id IN (SELECT id FROM cocktails WHERE venue_id = v_venue_id);
  DELETE FROM cocktails WHERE venue_id = v_venue_id;
  DELETE FROM stock_balances WHERE venue_id = v_venue_id;
  DELETE FROM products WHERE venue_id = v_venue_id;
  
  -- Clear audit logs for this venue
  DELETE FROM demo_event_logs WHERE venue_id = v_venue_id;
  DELETE FROM developer_flag_audit WHERE venue_id = v_venue_id;
  
  -- Re-seed demo data (will use existing Berlín venue and locations)
  RETURN seed_demo_data();
END;
$function$;

-- 5) Create helper function to get Berlín venue ID
CREATE OR REPLACE FUNCTION public.get_berlin_venue_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.venues WHERE slug = 'berlin-valdivia' LIMIT 1;
$$;