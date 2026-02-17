
CREATE OR REPLACE FUNCTION public.auto_redeem_sale_token(
  p_sale_id uuid,
  p_bar_location_id uuid,
  p_seller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record record;
  v_ingredient record;
  v_item record;
  v_active_jornada_id uuid;
  v_bar_name text;
  v_consumption_result jsonb;
  v_missing_items jsonb := '[]'::jsonb;
  v_consumed_ingredients jsonb := '[]'::jsonb;
  v_items_array jsonb := '[]'::jsonb;
  v_stock_check record;
  v_required_qty numeric;
  v_available_qty numeric;
  v_stock_ok boolean := true;
  v_preflight_errors jsonb := '[]'::jsonb;
BEGIN
  -- Lock the token row
  SELECT * INTO v_token_record
  FROM pickup_tokens
  WHERE sale_id = p_sale_id AND source_type = 'sale'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token no encontrado para esta venta');
  END IF;

  IF v_token_record.status <> 'issued' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Token ya procesado', 'status', v_token_record.status);
  END IF;

  SELECT name INTO v_bar_name FROM stock_locations WHERE id = p_bar_location_id;

  SELECT id INTO v_active_jornada_id 
  FROM jornadas WHERE estado = 'abierta' 
  ORDER BY created_at DESC LIMIT 1;
  IF v_active_jornada_id IS NULL THEN
    v_active_jornada_id := v_token_record.jornada_id;
  END IF;

  -- ═══ PHASE 1: Pre-flight stock check ═══
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name, c.id as cocktail_id
    FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      v_required_qty := v_ingredient.quantity * v_item.quantity;
      
      SELECT COALESCE(SUM(sm.quantity), 0) INTO v_available_qty
      FROM stock_movements sm
      WHERE sm.product_id = v_ingredient.product_id
        AND sm.location_id = p_bar_location_id;

      IF v_available_qty < v_required_qty THEN
        v_stock_ok := false;
        v_preflight_errors := v_preflight_errors || jsonb_build_array(jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required', v_required_qty,
          'available', v_available_qty,
          'unit', v_ingredient.unit
        ));
      END IF;
    END LOOP;
  END LOOP;

  -- If stock insufficient, leave QR as issued and return failure
  IF NOT v_stock_ok THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stock_insufficient',
      'message', 'Stock insuficiente para auto-canje. QR queda pendiente para canje manual.',
      'missing_items', v_preflight_errors,
      'bar_name', v_bar_name
    );
  END IF;

  -- ═══ PHASE 2: Consume stock (all checks passed) ═══
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name, c.id as cocktail_id
    FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
    LOOP
      v_consumption_result := consume_stock_fefo(
        p_product_id := v_ingredient.product_id,
        p_location_id := p_bar_location_id,
        p_quantity := v_ingredient.quantity * v_item.quantity,
        p_jornada_id := v_active_jornada_id,
        p_notes := 'Auto-redeem: ' || v_item.cocktail_name || ' | Token: ' || substr(v_token_record.token, 1, 8),
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'auto_redemption'
      );
      IF (v_consumption_result->>'success')::boolean THEN
        v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
          'product_id', v_ingredient.product_id,
          'product_name', v_ingredient.product_name,
          'quantity', v_ingredient.quantity * v_item.quantity,
          'lots', v_consumption_result->'lots'
        );
      ELSE
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_ingredient.product_name,
          'required_qty', v_ingredient.quantity * v_item.quantity,
          'unit', v_ingredient.unit,
          'error', v_consumption_result->>'error'
        ));
      END IF;
    END LOOP;
  END LOOP;

  -- Mark token as redeemed
  UPDATE pickup_tokens 
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_seller_id, bar_location_id = p_bar_location_id 
  WHERE id = v_token_record.id;

  -- Log the redemption
  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
  VALUES (
    p_seller_id, v_token_record.id, p_sale_id,
    'success'::redemption_result,
    p_bar_location_id, v_token_record.venue_id,
    jsonb_build_object('auto_redeem', true, 'bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients)
  );

  RETURN jsonb_build_object(
    'success', true, 'message', 'Auto-canje ejecutado', 'bar_name', v_bar_name,
    'items', v_items_array, 'consumed', v_consumed_ingredients
  );
END;
$$;
