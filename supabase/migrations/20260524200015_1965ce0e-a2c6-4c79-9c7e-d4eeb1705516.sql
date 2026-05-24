-- Fix auto_redeem_sale_token: write jornada_id into pickup_redemptions_log column
-- (was only stored in metadata, breaking RedeemReportButton filter)

CREATE OR REPLACE FUNCTION public.auto_redeem_sale_token(p_sale_id uuid, p_bar_location_id uuid, p_seller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record record;
  v_ingredient record;
  v_item record;
  v_active_jornada_id uuid;
  v_bar_name text;
  v_theoretical_consumption jsonb := '[]'::jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_items_array jsonb := '[]'::jsonb;
  v_frozen boolean := false;
  v_resolved_venue_id uuid;
BEGIN
  SELECT * INTO v_token_record FROM pickup_tokens WHERE sale_id = p_sale_id AND source_type = 'sale' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Token no encontrado para esta venta'); END IF;
  IF v_token_record.status <> 'issued' THEN RETURN jsonb_build_object('success', true, 'message', 'Token ya procesado', 'status', v_token_record.status); END IF;

  SELECT name INTO v_bar_name FROM stock_locations WHERE id = p_bar_location_id;
  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;
  IF v_active_jornada_id IS NULL THEN v_active_jornada_id := v_token_record.jornada_id; END IF;

  v_resolved_venue_id := COALESCE(v_token_record.venue_id, (SELECT venue_id FROM sales WHERE id = p_sale_id), '4e128e76-980d-4233-a438-92aa02cfb50b'::uuid);
  v_frozen := is_inventory_frozen(v_resolved_venue_id);

  FOR v_item IN SELECT si.*, c.name AS cocktail_name, c.id AS cocktail_id FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id WHERE si.sale_id = p_sale_id LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    v_items_snapshot := v_items_snapshot || jsonb_build_object('cocktail_name', v_item.cocktail_name, 'cocktail_id', v_item.cocktail_id, 'quantity', v_item.quantity);
    FOR v_ingredient IN SELECT ci.*, p.name AS product_name, p.unit FROM cocktail_ingredients ci JOIN products p ON p.id = ci.product_id WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL LOOP
      v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object('product_id', v_ingredient.product_id, 'product_name', v_ingredient.product_name, 'quantity', v_ingredient.quantity * v_item.quantity, 'unit', COALESCE(v_ingredient.unit, 'ud'));
    END LOOP;
  END LOOP;

  UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_seller_id, bar_location_id = p_bar_location_id WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, jornada_id, metadata, theoretical_consumption, items_snapshot, bar_location_id)
  VALUES (p_seller_id, v_token_record.id, p_sale_id, 'success'::redemption_result, p_bar_location_id, v_resolved_venue_id, v_active_jornada_id,
    jsonb_build_object('auto_redeem', true, 'bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'inventory_frozen', v_frozen),
    v_theoretical_consumption, v_items_snapshot, p_bar_location_id);

  RETURN jsonb_build_object('success', true, 'message', 'Auto-canje ejecutado', 'bar_name', v_bar_name, 'items', v_items_array, 'consumed', v_theoretical_consumption, 'inventory_frozen', v_frozen);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_redeem_sale_token(p_sale_id uuid, p_bar_location_id uuid, p_seller_id uuid, p_mixer_overrides jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record record;
  v_ingredient record;
  v_item record;
  v_active_jornada_id uuid;
  v_bar_name text;
  v_theoretical_consumption jsonb := '[]'::jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_items_array jsonb := '[]'::jsonb;
  v_frozen boolean := false;
  v_resolved_venue_id uuid;
BEGIN
  SELECT * INTO v_token_record FROM pickup_tokens WHERE sale_id = p_sale_id AND source_type = 'sale' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Token no encontrado para esta venta'); END IF;
  IF v_token_record.status <> 'issued' THEN RETURN jsonb_build_object('success', true, 'message', 'Token ya procesado', 'status', v_token_record.status); END IF;

  SELECT name INTO v_bar_name FROM stock_locations WHERE id = p_bar_location_id;
  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;
  IF v_active_jornada_id IS NULL THEN v_active_jornada_id := v_token_record.jornada_id; END IF;

  v_resolved_venue_id := COALESCE(v_token_record.venue_id, (SELECT venue_id FROM sales WHERE id = p_sale_id));
  v_frozen := is_inventory_frozen(v_resolved_venue_id);

  FOR v_item IN SELECT si.*, c.name AS cocktail_name, c.id AS cocktail_id FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id WHERE si.sale_id = p_sale_id LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    v_items_snapshot := v_items_snapshot || jsonb_build_object('cocktail_name', v_item.cocktail_name, 'cocktail_id', v_item.cocktail_id, 'quantity', v_item.quantity);
    FOR v_ingredient IN SELECT ci.*, p.name AS product_name, p.unit FROM cocktail_ingredients ci JOIN products p ON p.id = ci.product_id WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL LOOP
      v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object('product_id', v_ingredient.product_id, 'product_name', v_ingredient.product_name, 'quantity', v_ingredient.quantity * v_item.quantity, 'unit', COALESCE(v_ingredient.unit, 'ud'));
    END LOOP;
  END LOOP;

  UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_seller_id, bar_location_id = p_bar_location_id WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, jornada_id, metadata, theoretical_consumption, items_snapshot, bar_location_id)
  VALUES (p_seller_id, v_token_record.id, p_sale_id, 'success'::redemption_result, p_bar_location_id, v_resolved_venue_id, v_active_jornada_id,
    jsonb_build_object('auto_redeem', true, 'bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'inventory_frozen', v_frozen),
    v_theoretical_consumption, v_items_snapshot, p_bar_location_id);

  RETURN jsonb_build_object('success', true, 'message', 'Auto-canje ejecutado', 'bar_name', v_bar_name, 'items', v_items_array, 'consumed', v_theoretical_consumption, 'inventory_frozen', v_frozen);
END;
$function$;

-- Backfill: recuperar jornada_id de filas auto_redeem previas (desde metadata o desde el token/venta)
UPDATE pickup_redemptions_log l
SET jornada_id = COALESCE(
  NULLIF(l.metadata->>'jornada_id','')::uuid,
  (SELECT pt.jornada_id FROM pickup_tokens pt WHERE pt.id = l.pickup_token_id),
  (SELECT s.jornada_id FROM sales s WHERE s.id = l.sale_id)
)
WHERE l.jornada_id IS NULL
  AND l.result = 'success'
  AND (l.metadata->>'auto_redeem') = 'true';