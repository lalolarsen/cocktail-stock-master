
-- 1) New RPC: check mixer requirements for a sale (by sale_id, not token)
CREATE OR REPLACE FUNCTION public.check_sale_mixer_requirements(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mixer_slots jsonb := '[]'::jsonb;
  v_item record;
  v_ingredient record;
  v_slot_index int := 0;
  v_available_mixers jsonb;
  v_venue_id uuid;
BEGIN
  -- Get venue from sale
  SELECT venue_id INTO v_venue_id FROM sales WHERE id = p_sale_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALE_NOT_FOUND');
  END IF;

  -- Check all sale items for mixer slots
  FOR v_item IN
    SELECT si.cocktail_id, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.category as product_category
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
        AND ci.is_mixer_slot = true
      ORDER BY ci.created_at
    LOOP
      -- Get available mixers (same category products in this venue)
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
      INTO v_available_mixers
      FROM products p
      WHERE p.category = v_ingredient.product_category
        AND p.venue_id = v_venue_id;

      v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
        'slot_index', v_slot_index,
        'label', v_item.cocktail_name || ' — Mixer',
        'default_product_id', v_ingredient.product_id,
        'default_product_name', v_ingredient.product_name,
        'quantity', v_ingredient.quantity,
        'available_options', COALESCE(v_available_mixers, '[]'::jsonb)
      ));
      v_slot_index := v_slot_index + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'requires_mixer', jsonb_array_length(v_mixer_slots) > 0,
    'mixer_slots', v_mixer_slots
  );
END;
$$;

-- 2) Update auto_redeem_sale_token to accept mixer_overrides
CREATE OR REPLACE FUNCTION public.auto_redeem_sale_token(
  p_sale_id uuid,
  p_bar_location_id uuid,
  p_seller_id uuid,
  p_mixer_overrides jsonb DEFAULT NULL
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
  v_effective_product_id uuid;
  v_effective_product_name text;
  v_mixer_override record;
  v_slot_idx int := 0;
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
  v_slot_idx := 0;
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name, c.id as cocktail_id
    FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
      ORDER BY ci.created_at
    LOOP
      -- Apply mixer override if this is a mixer slot
      v_effective_product_id := v_ingredient.product_id;
      v_effective_product_name := v_ingredient.product_name;
      
      IF v_ingredient.is_mixer_slot AND p_mixer_overrides IS NOT NULL THEN
        SELECT (mo->>'product_id')::uuid INTO v_effective_product_id
        FROM jsonb_array_elements(p_mixer_overrides) mo
        WHERE (mo->>'slot_index')::int = v_slot_idx;
        
        IF v_effective_product_id IS NOT NULL AND v_effective_product_id != v_ingredient.product_id THEN
          SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
        ELSE
          v_effective_product_id := v_ingredient.product_id;
        END IF;
      END IF;
      
      IF v_ingredient.is_mixer_slot THEN
        v_slot_idx := v_slot_idx + 1;
      END IF;

      v_required_qty := v_ingredient.quantity * v_item.quantity;
      
      SELECT COALESCE(SUM(sm.quantity), 0) INTO v_available_qty
      FROM stock_movements sm
      WHERE sm.product_id = v_effective_product_id
        AND sm.location_id = p_bar_location_id;

      IF v_available_qty < v_required_qty THEN
        v_stock_ok := false;
        v_preflight_errors := v_preflight_errors || jsonb_build_array(jsonb_build_object(
          'product_name', v_effective_product_name,
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
  v_slot_idx := 0;
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
      ORDER BY ci.created_at
    LOOP
      -- Apply mixer override
      v_effective_product_id := v_ingredient.product_id;
      v_effective_product_name := v_ingredient.product_name;
      
      IF v_ingredient.is_mixer_slot AND p_mixer_overrides IS NOT NULL THEN
        SELECT (mo->>'product_id')::uuid INTO v_effective_product_id
        FROM jsonb_array_elements(p_mixer_overrides) mo
        WHERE (mo->>'slot_index')::int = v_slot_idx;
        
        IF v_effective_product_id IS NOT NULL AND v_effective_product_id != v_ingredient.product_id THEN
          SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
        ELSE
          v_effective_product_id := v_ingredient.product_id;
        END IF;
      END IF;
      
      IF v_ingredient.is_mixer_slot THEN
        v_slot_idx := v_slot_idx + 1;
      END IF;

      v_consumption_result := consume_stock_fefo(
        p_product_id := v_effective_product_id,
        p_location_id := p_bar_location_id,
        p_quantity := v_ingredient.quantity * v_item.quantity,
        p_jornada_id := v_active_jornada_id,
        p_notes := 'Auto-redeem: ' || v_item.cocktail_name || ' | Token: ' || substr(v_token_record.token, 1, 8),
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'auto_redemption'
      );
      IF (v_consumption_result->>'success')::boolean THEN
        v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
          'product_id', v_effective_product_id,
          'product_name', v_effective_product_name,
          'quantity', v_ingredient.quantity * v_item.quantity,
          'lots', v_consumption_result->'lots'
        );
      ELSE
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_effective_product_name,
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
    jsonb_build_object(
      'auto_redeem', true, 
      'bar_name', v_bar_name, 
      'jornada_id', v_active_jornada_id, 
      'ingredients_consumed', v_consumed_ingredients,
      'mixer_overrides', COALESCE(p_mixer_overrides, '[]'::jsonb)
    )
  );

  RETURN jsonb_build_object(
    'success', true, 'message', 'Auto-canje ejecutado', 'bar_name', v_bar_name,
    'items', v_items_array, 'consumed', v_consumed_ingredients
  );
END;
$$;
