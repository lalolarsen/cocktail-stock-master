-- venues already has is_demo column, let's add demo settings directly to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS max_pos integer NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_bars integer NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- Settings will include: allow_emails, allow_real_invoicing, allow_exports

-- Create seed_demo_data function
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
  -- Check if demo already exists
  SELECT id INTO v_venue_id FROM venues WHERE is_demo = true LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Demo venue already exists', 'venue_id', v_venue_id);
  END IF;

  -- Create demo venue
  INSERT INTO venues (name, slug, plan_type, is_demo, onboarding_completed, max_pos, max_bars)
  VALUES ('Demo Coctelería', 'demo', 'demo', true, true, 5, 5)
  RETURNING id INTO v_venue_id;

  -- Create warehouse
  INSERT INTO stock_locations (name, type, is_active, venue_id)
  VALUES ('Bodega Principal', 'warehouse', true, v_venue_id)
  RETURNING id INTO v_warehouse_id;

  -- Create 2 bars
  INSERT INTO stock_locations (name, type, is_active, venue_id)
  VALUES ('Barra Principal', 'bar', true, v_venue_id)
  RETURNING id INTO v_bar1_id;

  INSERT INTO stock_locations (name, type, is_active, venue_id)
  VALUES ('Barra Terraza', 'bar', true, v_venue_id)
  RETURNING id INTO v_bar2_id;

  -- Create 2 POS terminals
  INSERT INTO pos_terminals (name, location_id, is_active, venue_id)
  VALUES ('Caja 1', v_bar1_id, true, v_venue_id)
  RETURNING id INTO v_pos1_id;

  INSERT INTO pos_terminals (name, location_id, is_active, venue_id)
  VALUES ('Caja 2', v_bar2_id, true, v_venue_id)
  RETURNING id INTO v_pos2_id;

  -- Create 10 demo products
  INSERT INTO products (code, name, category, unit, current_stock, minimum_stock, cost_per_unit, venue_id)
  VALUES 
    (generate_product_code(), 'Ron Havana 3 Años', 'ml', 'ml', 5000, 500, 15, v_venue_id),
    (generate_product_code(), 'Vodka Absolut', 'ml', 'ml', 4000, 400, 18, v_venue_id),
    (generate_product_code(), 'Gin Beefeater', 'ml', 'ml', 3000, 300, 22, v_venue_id),
    (generate_product_code(), 'Tequila José Cuervo', 'ml', 'ml', 2500, 250, 20, v_venue_id),
    (generate_product_code(), 'Pisco Capel', 'ml', 'ml', 3500, 350, 12, v_venue_id),
    (generate_product_code(), 'Jugo de Limón', 'ml', 'ml', 2000, 200, 3, v_venue_id),
    (generate_product_code(), 'Jarabe Simple', 'ml', 'ml', 1500, 150, 2, v_venue_id),
    (generate_product_code(), 'Triple Sec', 'ml', 'ml', 1000, 100, 10, v_venue_id),
    (generate_product_code(), 'Angostura Bitters', 'ml', 'ml', 500, 50, 30, v_venue_id),
    (generate_product_code(), 'Hielo', 'gramos', 'g', 10000, 1000, 1, v_venue_id);

  -- Get product IDs for cocktail ingredients
  SELECT ARRAY_AGG(id ORDER BY name) INTO v_product_ids FROM products WHERE venue_id = v_venue_id;

  -- Create 8 demo cocktails
  INSERT INTO cocktails (name, description, price, category, venue_id)
  VALUES 
    ('Mojito', 'Refrescante cóctel cubano con ron, menta y lima', 5500, 'clasicos', v_venue_id),
    ('Margarita', 'Clásico mexicano con tequila, triple sec y limón', 6000, 'clasicos', v_venue_id),
    ('Pisco Sour', 'Tradicional chileno con pisco, limón y clara de huevo', 5000, 'clasicos', v_venue_id),
    ('Gin Tonic', 'Elegante combinación de gin y agua tónica', 5500, 'clasicos', v_venue_id),
    ('Cuba Libre', 'Ron con coca cola y limón', 4500, 'clasicos', v_venue_id),
    ('Cosmopolitan', 'Vodka con triple sec, jugo de arándano y lima', 6500, 'signature', v_venue_id),
    ('Old Fashioned', 'Bourbon con bitters y azúcar', 7000, 'signature', v_venue_id),
    ('Daiquiri', 'Ron blanco con limón y jarabe simple', 5500, 'clasicos', v_venue_id);

  -- Get cocktail IDs
  SELECT ARRAY_AGG(id ORDER BY name) INTO v_cocktail_ids FROM cocktails WHERE venue_id = v_venue_id;

  -- Add ingredients to cocktails (simplified - using available products)
  -- Mojito (Ron + Jugo de Limón + Jarabe)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[5], v_product_ids[1], 60 -- Ron
  UNION ALL SELECT v_cocktail_ids[5], v_product_ids[6], 30 -- Jugo de Limón
  UNION ALL SELECT v_cocktail_ids[5], v_product_ids[7], 15; -- Jarabe

  -- Margarita (Tequila + Triple Sec + Jugo de Limón)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[4], v_product_ids[4], 60 -- Tequila
  UNION ALL SELECT v_cocktail_ids[4], v_product_ids[8], 30 -- Triple Sec
  UNION ALL SELECT v_cocktail_ids[4], v_product_ids[6], 30; -- Jugo de Limón

  -- Pisco Sour (Pisco + Jugo de Limón + Jarabe)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[7], v_product_ids[5], 60 -- Pisco
  UNION ALL SELECT v_cocktail_ids[7], v_product_ids[6], 30 -- Jugo de Limón
  UNION ALL SELECT v_cocktail_ids[7], v_product_ids[7], 20; -- Jarabe

  -- Gin Tonic (Gin)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[3], v_product_ids[3], 60; -- Gin

  -- Cuba Libre (Ron)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[1], v_product_ids[1], 60; -- Ron

  -- Cosmopolitan (Vodka + Triple Sec + Jugo de Limón)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[2], v_product_ids[2], 45 -- Vodka
  UNION ALL SELECT v_cocktail_ids[2], v_product_ids[8], 20 -- Triple Sec
  UNION ALL SELECT v_cocktail_ids[2], v_product_ids[6], 15; -- Jugo de Limón

  -- Old Fashioned (simplified with available products)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[6], v_product_ids[1], 60 -- Ron (stand-in for bourbon)
  UNION ALL SELECT v_cocktail_ids[6], v_product_ids[9], 2 -- Bitters
  UNION ALL SELECT v_cocktail_ids[6], v_product_ids[7], 10; -- Jarabe

  -- Daiquiri (Ron + Jugo de Limón + Jarabe)
  INSERT INTO cocktail_ingredients (cocktail_id, product_id, quantity)
  SELECT v_cocktail_ids[8], v_product_ids[1], 60 -- Ron
  UNION ALL SELECT v_cocktail_ids[8], v_product_ids[6], 30 -- Jugo de Limón
  UNION ALL SELECT v_cocktail_ids[8], v_product_ids[7], 15; -- Jarabe

  -- Initialize stock balances for warehouse
  INSERT INTO stock_balances (product_id, location_id, quantity)
  SELECT id, v_warehouse_id, current_stock FROM products WHERE venue_id = v_venue_id;

  -- Add some stock to bars
  INSERT INTO stock_balances (product_id, location_id, quantity)
  SELECT id, v_bar1_id, current_stock * 0.3 FROM products WHERE venue_id = v_venue_id;

  INSERT INTO stock_balances (product_id, location_id, quantity)
  SELECT id, v_bar2_id, current_stock * 0.2 FROM products WHERE venue_id = v_venue_id;

  -- Create active jornada
  INSERT INTO jornadas (numero_jornada, semana_inicio, fecha, hora_apertura, estado, venue_id)
  VALUES (1, CURRENT_DATE, CURRENT_DATE, CURRENT_TIME, 'activa', v_venue_id)
  RETURNING id INTO v_jornada_id;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', v_venue_id,
    'warehouse_id', v_warehouse_id,
    'bar_ids', ARRAY[v_bar1_id, v_bar2_id],
    'pos_ids', ARRAY[v_pos1_id, v_pos2_id],
    'jornada_id', v_jornada_id,
    'products_count', array_length(v_product_ids, 1),
    'cocktails_count', array_length(v_cocktail_ids, 1)
  );
END;
$function$;

-- Create reset_demo_data function
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_venue_id UUID;
BEGIN
  -- Check admin permission
  IF NOT has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized - admin only');
  END IF;

  -- Get demo venue
  SELECT id INTO v_venue_id FROM venues WHERE is_demo = true LIMIT 1;
  
  IF v_venue_id IS NULL THEN
    -- No demo to reset, create new
    RETURN seed_demo_data();
  END IF;

  -- Delete all demo data in order (respecting foreign keys)
  DELETE FROM stock_movements WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM pickup_tokens WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sales_documents WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = v_venue_id);
  DELETE FROM sales WHERE venue_id = v_venue_id;
  DELETE FROM cash_registers WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = v_venue_id);
  DELETE FROM jornadas WHERE venue_id = v_venue_id;
  DELETE FROM cocktail_ingredients WHERE cocktail_id IN (SELECT id FROM cocktails WHERE venue_id = v_venue_id);
  DELETE FROM cocktails WHERE venue_id = v_venue_id;
  DELETE FROM stock_balances WHERE location_id IN (SELECT id FROM stock_locations WHERE venue_id = v_venue_id);
  DELETE FROM stock_alerts WHERE product_id IN (SELECT id FROM products WHERE venue_id = v_venue_id);
  DELETE FROM products WHERE venue_id = v_venue_id;
  DELETE FROM pos_terminals WHERE venue_id = v_venue_id;
  DELETE FROM stock_locations WHERE venue_id = v_venue_id;
  DELETE FROM venues WHERE id = v_venue_id;

  -- Re-seed
  RETURN seed_demo_data();
END;
$function$;