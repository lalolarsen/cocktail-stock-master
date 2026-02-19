
-- ============================================================
-- FIX 1: check_token_mixer_requirements
-- Problem: Only checked cover tokens for mixer slots, never sale tokens.
-- Also: Used INNER JOIN on products which skips NULL product_id mixer slots.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_token_mixer_requirements(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record RECORD;
  v_mixer_slots jsonb := '[]'::jsonb;
  v_slot_index int := 0;
  v_cocktail_id uuid;
  v_sale_record RECORD;
BEGIN
  -- Get token
  SELECT * INTO v_token_record
  FROM pickup_tokens
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOKEN_NOT_FOUND', 'requires_mixer_selection', false);
  END IF;

  IF v_token_record.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED', 'requires_mixer_selection', false);
  END IF;

  IF v_token_record.status = 'expired' OR (v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOKEN_EXPIRED', 'requires_mixer_selection', false);
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALE_CANCELLED', 'requires_mixer_selection', false);
  END IF;

  -- ══ COVER TOKEN ══
  IF v_token_record.cover_cocktail_id IS NOT NULL THEN
    v_cocktail_id := v_token_record.cover_cocktail_id;

    FOR v_sale_record IN
      SELECT ci.id, ci.mixer_category, ci.quantity
      FROM cocktail_ingredients ci
      WHERE ci.cocktail_id = v_cocktail_id
        AND ci.is_mixer_slot = true
      ORDER BY ci.created_at, ci.id
    LOOP
      DECLARE
        v_options jsonb := '[]'::jsonb;
        v_cat text := COALESCE(v_sale_record.mixer_category, 'latas');
        v_db_category text;
        v_option_record RECORD;
      BEGIN
        IF v_cat = 'redbull' THEN
          v_db_category := 'redbull';
        ELSE
          v_db_category := 'mixers_tradicionales';
        END IF;

        FOR v_option_record IN
          SELECT id, name, category
          FROM products
          WHERE category = v_db_category
            AND venue_id = v_token_record.venue_id
          ORDER BY name
        LOOP
          v_options := v_options || jsonb_build_object('id', v_option_record.id, 'name', v_option_record.name);
        END LOOP;

        v_mixer_slots := v_mixer_slots || jsonb_build_object(
          'slot_index', v_slot_index,
          'label', CASE WHEN v_db_category = 'redbull' THEN 'Red Bull' ELSE 'Mixer' END,
          'mixer_category', v_cat,
          'default_product_id', '',
          'default_product_name', '',
          'quantity', COALESCE(v_sale_record.quantity, 1),
          'available_options', v_options
        );
        v_slot_index := v_slot_index + 1;
      END;
    END LOOP;

    IF jsonb_array_length(v_mixer_slots) > 0 THEN
      RETURN jsonb_build_object('success', true, 'requires_mixer_selection', true, 'mixer_slots', v_mixer_slots);
    END IF;

    -- Cover without mixer slots
    RETURN jsonb_build_object('success', true, 'requires_mixer_selection', false);
  END IF;

  -- ══ SALE TOKEN ══ (THIS WAS MISSING BEFORE!)
  IF v_token_record.sale_id IS NOT NULL THEN
    FOR v_sale_record IN
      SELECT ci.id, ci.mixer_category, ci.quantity, c.name as cocktail_name
      FROM sale_items si
      JOIN cocktails c ON c.id = si.cocktail_id
      JOIN cocktail_ingredients ci ON ci.cocktail_id = c.id
      WHERE si.sale_id = v_token_record.sale_id
        AND ci.is_mixer_slot = true
      ORDER BY si.id, ci.created_at, ci.id
    LOOP
      DECLARE
        v_options jsonb := '[]'::jsonb;
        v_cat text := COALESCE(v_sale_record.mixer_category, 'latas');
        v_db_category text;
        v_option_record RECORD;
      BEGIN
        IF v_cat = 'redbull' THEN
          v_db_category := 'redbull';
        ELSE
          v_db_category := 'mixers_tradicionales';
        END IF;

        FOR v_option_record IN
          SELECT id, name, category
          FROM products
          WHERE category = v_db_category
            AND venue_id = v_token_record.venue_id
          ORDER BY name
        LOOP
          v_options := v_options || jsonb_build_object('id', v_option_record.id, 'name', v_option_record.name);
        END LOOP;

        v_mixer_slots := v_mixer_slots || jsonb_build_object(
          'slot_index', v_slot_index,
          'label', v_sale_record.cocktail_name || ' — Mixer',
          'mixer_category', v_cat,
          'default_product_id', '',
          'default_product_name', '',
          'quantity', COALESCE(v_sale_record.quantity, 1),
          'available_options', v_options
        );
        v_slot_index := v_slot_index + 1;
      END;
    END LOOP;

    IF jsonb_array_length(v_mixer_slots) > 0 THEN
      RETURN jsonb_build_object('success', true, 'requires_mixer_selection', true, 'mixer_slots', v_mixer_slots);
    END IF;
  END IF;

  -- No mixer slots needed
  RETURN jsonb_build_object('success', true, 'requires_mixer_selection', false);
END;
$$;

-- ============================================================
-- FIX 2: redeem_pickup_token (latest version)
-- Problem: INNER JOIN on products skips mixer slots with NULL product_id.
-- Fix: Use LEFT JOIN and only consume if product_id is resolved (via override or original).
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_pickup_token(
  p_token text,
  p_bartender_bar_id uuid DEFAULT NULL,
  p_mixer_overrides jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record record;
  v_sale record;
  v_cocktail record;
  v_ingredient record;
  v_bar_location_id uuid;
  v_bar_name text;
  v_active_jornada_id uuid;
  v_consumption_result jsonb;
  v_missing_items jsonb := '[]'::jsonb;
  v_venue_is_demo boolean := false;
  v_item record;
  v_deliver jsonb;
  v_ticket_number text;
  v_items_array jsonb := '[]'::jsonb;
  v_last_attempt timestamptz;
  v_rate_limit_seconds constant int := 2;
  v_bartender_id uuid;
  v_consumed_ingredients jsonb := '[]'::jsonb;
  v_override_product_id uuid;
  v_ingredient_index int := 0;
  v_item_addons jsonb;
  v_venue_id uuid;
  v_effective_product_id uuid;
  v_effective_product_name text;
BEGIN
  v_bartender_id := auth.uid();

  -- STEP 1: Rate limit check
  SELECT prl.redeemed_at INTO v_last_attempt
  FROM pickup_redemptions_log prl
  JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
  WHERE pt.token = p_token
    AND prl.bartender_id = v_bartender_id
    AND prl.redeemed_at > now() - (v_rate_limit_seconds || ' seconds')::interval
  ORDER BY prl.redeemed_at DESC
  LIMIT 1;

  IF v_last_attempt IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TOO_FAST', 'message', 'Espera un momento antes de escanear de nuevo');
  END IF;

  -- STEP 2: Find and LOCK the token
  SELECT pt.*,
         s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
         s.bar_location_id as sale_bar_location_id,
         COALESCE(pt.venue_id, s.venue_id, ts.venue_id) as venue_id,
         ts.ticket_number,
         s.jornada_id as sale_jornada_id
  INTO v_token_record
  FROM pickup_tokens pt
  LEFT JOIN sales s ON s.id = pt.sale_id
  LEFT JOIN ticket_sales ts ON ts.id = pt.ticket_sale_id
  WHERE pt.token = p_token
  FOR UPDATE OF pt;

  IF NOT FOUND THEN
    DECLARE v_fallback_venue uuid;
    BEGIN
      SELECT id INTO v_fallback_venue FROM venues LIMIT 1;
      INSERT INTO pickup_redemptions_log (bartender_id, result, metadata, pos_id, venue_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 'not_found', jsonb_build_object('raw_token', p_token), p_bartender_bar_id, v_fallback_venue);
    END;
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_NOT_FOUND', 'message', 'Token no encontrado');
  END IF;

  v_venue_id := v_token_record.venue_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Token sin venue_id: %', p_token;
  END IF;

  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_venue_id;

  -- STEP 3: Determine bar location
  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id);
  IF v_bar_location_id IS NULL THEN
    SELECT id INTO v_bar_location_id FROM stock_locations WHERE type = 'bar' AND is_active = true LIMIT 1;
  END IF;
  SELECT name INTO v_bar_name FROM stock_locations WHERE id = v_bar_location_id;

  -- STEP 4: Validate token status
  IF v_token_record.status = 'redeemed' THEN
    IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
      SELECT name INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
      v_deliver := jsonb_build_object('type', 'cover', 'name', COALESCE(v_cocktail.name, 'Cover'), 'quantity', COALESCE(v_token_record.cover_quantity, 1), 'source', 'ticket');
    ELSE
      SELECT jsonb_agg(jsonb_build_object('name', c.name, 'quantity', si.quantity, 'addons', COALESCE((SELECT jsonb_agg(sia.addon_name) FROM sale_item_addons sia WHERE sia.sale_item_id = si.id), '[]'::jsonb)))
      INTO v_items_array FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id WHERE si.sale_id = v_token_record.sale_id;
      v_deliver := jsonb_build_object('type', 'menu_items', 'items', COALESCE(v_items_array, '[]'::jsonb), 'source', 'sale', 'sale_number', v_token_record.sale_number);
    END IF;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'already_redeemed', v_bar_location_id, v_venue_id, jsonb_build_object('original_redeemed_at', v_token_record.redeemed_at, 'bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_REDEEMED', 'message', 'Este QR ya fue canjeado', 'deliver', v_deliver, 'previously_redeemed_at', v_token_record.redeemed_at);
  END IF;

  IF v_token_record.status = 'expired' OR (v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now()) THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'expired', v_bar_location_id, v_venue_id, jsonb_build_object('expired_at', v_token_record.expires_at, 'bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'Token expirado');
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'cancelled', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- STEP 5: Get active jornada
  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;
  IF v_active_jornada_id IS NULL THEN
    v_active_jornada_id := v_token_record.sale_jornada_id;
  END IF;

  -- STEP 6: Process COVER TOKEN
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    IF NOT FOUND THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'not_found', v_bar_location_id, v_venue_id, jsonb_build_object('error', 'cocktail_not_found', 'cocktail_id', v_token_record.cover_cocktail_id));
      RETURN jsonb_build_object('success', false, 'error_code', 'COCKTAIL_NOT_FOUND', 'message', 'Cocktail no encontrado');
    END IF;

    v_ingredient_index := 0;
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_cocktail.id
      ORDER BY ci.created_at
    LOOP
      -- Resolve effective product: override for mixer slots, original otherwise
      v_effective_product_id := v_ingredient.product_id;
      v_effective_product_name := v_ingredient.product_name;

      IF v_ingredient.is_mixer_slot THEN
        IF p_mixer_overrides IS NOT NULL THEN
          SELECT (elem->>'product_id')::uuid INTO v_override_product_id
          FROM jsonb_array_elements(p_mixer_overrides) elem
          WHERE (elem->>'slot_index')::int = v_ingredient_index;
          IF v_override_product_id IS NOT NULL THEN
            v_effective_product_id := v_override_product_id;
            SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
          END IF;
        END IF;
        v_ingredient_index := v_ingredient_index + 1;
      END IF;

      -- Skip if no product resolved (mixer slot without override and no default)
      IF v_effective_product_id IS NULL THEN
        CONTINUE;
      END IF;

      v_consumption_result := consume_stock_fefo(
        p_product_id := v_effective_product_id,
        p_location_id := v_bar_location_id,
        p_quantity := v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
        p_jornada_id := v_active_jornada_id,
        p_notes := 'Cover redemption: ' || v_cocktail.name || ' | Token: ' || substr(p_token, 1, 8),
        p_pickup_token_id := v_token_record.id,
        p_source_type := 'cover_redemption'
      );

      IF (v_consumption_result->>'success')::boolean THEN
        v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
          'product_id', v_effective_product_id, 'product_name', v_effective_product_name,
          'quantity', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
          'lots', v_consumption_result->'lots', 'was_overridden', v_effective_product_id != COALESCE(v_ingredient.product_id, '00000000-0000-0000-0000-000000000000'::uuid)
        );
      ELSE
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_effective_product_name,
          'required_qty', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
          'unit', COALESCE(v_ingredient.unit, 'ud'), 'error', v_consumption_result->>'error'
        ));
      END IF;
    END LOOP;

    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id, v_venue_id, jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'consumed', v_consumed_ingredients));
      v_deliver := jsonb_build_object('type', 'cover', 'name', v_cocktail.name, 'quantity', COALESCE(v_token_record.cover_quantity, 1), 'source', 'ticket');
      RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en esta barra', 'bar_name', v_bar_name, 'deliver', v_deliver, 'missing', v_missing_items);
    END IF;

    UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id, bar_location_id = v_bar_location_id WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients));
    v_deliver := jsonb_build_object('type', 'cover', 'name', v_cocktail.name, 'quantity', COALESCE(v_token_record.cover_quantity, 1), 'source', 'ticket', 'ticket_number', v_token_record.ticket_number);
    RETURN jsonb_build_object('success', true, 'message', 'Canje exitoso', 'deliver', v_deliver, 'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name), 'redeemed_at', now());
  END IF;

  -- STEP 7: REGULAR SALE TOKEN
  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'not_paid', v_bar_location_id, v_venue_id, jsonb_build_object('payment_status', v_token_record.payment_status, 'bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'PAYMENT_NOT_CONFIRMED', 'message', 'Pago no confirmado');
  END IF;

  IF v_token_record.is_cancelled = true THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'cancelled', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name));
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- Process each sale item — LEFT JOIN to include mixer slots with NULL product_id
  FOR v_item IN
    SELECT si.*, c.id as cocktail_id, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_token_record.sale_id
  LOOP
    SELECT COALESCE(jsonb_agg(sia.addon_name), '[]'::jsonb) INTO v_item_addons FROM sale_item_addons sia WHERE sia.sale_item_id = v_item.id;

    FOR i IN 1..v_item.quantity LOOP
      v_ingredient_index := 0;
      FOR v_ingredient IN
        SELECT ci.*, p.name as product_name, p.unit
        FROM cocktail_ingredients ci
        LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.cocktail_id = v_item.cocktail_id
        ORDER BY ci.created_at
      LOOP
        -- Resolve effective product
        v_effective_product_id := v_ingredient.product_id;
        v_effective_product_name := v_ingredient.product_name;

        IF v_ingredient.is_mixer_slot THEN
          IF p_mixer_overrides IS NOT NULL THEN
            SELECT (elem->>'product_id')::uuid INTO v_override_product_id
            FROM jsonb_array_elements(p_mixer_overrides) elem
            WHERE (elem->>'slot_index')::int = v_ingredient_index;
            IF v_override_product_id IS NOT NULL THEN
              v_effective_product_id := v_override_product_id;
              SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
            END IF;
          END IF;
          v_ingredient_index := v_ingredient_index + 1;
        END IF;

        -- Skip if no product resolved
        IF v_effective_product_id IS NULL THEN
          CONTINUE;
        END IF;

        v_consumption_result := consume_stock_fefo(
          p_product_id := v_effective_product_id,
          p_location_id := v_bar_location_id,
          p_quantity := v_ingredient.quantity,
          p_jornada_id := v_active_jornada_id,
          p_notes := 'Sale item: ' || v_item.cocktail_name || ' | Token: ' || substr(p_token, 1, 8),
          p_pickup_token_id := v_token_record.id,
          p_source_type := 'sale_redemption'
        );

        IF (v_consumption_result->>'success')::boolean THEN
          v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
            'product_id', v_effective_product_id, 'product_name', v_effective_product_name,
            'quantity', v_ingredient.quantity, 'lots', v_consumption_result->'lots',
            'was_overridden', v_effective_product_id != COALESCE(v_ingredient.product_id, '00000000-0000-0000-0000-000000000000'::uuid)
          );
        ELSE
          v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
            'product_name', v_effective_product_name, 'required_qty', v_ingredient.quantity,
            'unit', COALESCE(v_ingredient.unit, 'ud'), 'error', v_consumption_result->>'error'
          ));
        END IF;
      END LOOP;
    END LOOP;

    v_items_array := v_items_array || jsonb_build_array(jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity, 'addons', v_item_addons));
  END LOOP;

  IF jsonb_array_length(v_missing_items) > 0 THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id, v_venue_id, jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'consumed', v_consumed_ingredients));
    v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array, 'source', 'sale', 'sale_number', v_token_record.sale_number);
    RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en esta barra', 'bar_name', v_bar_name, 'deliver', v_deliver, 'missing', v_missing_items);
  END IF;

  UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id, bar_location_id = v_bar_location_id WHERE id = v_token_record.id;
  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
  VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients));
  v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array, 'source', 'sale', 'sale_number', v_token_record.sale_number);
  RETURN jsonb_build_object('success', true, 'message', 'Canje exitoso', 'deliver', v_deliver, 'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name), 'sale_number', v_token_record.sale_number, 'total_amount', v_token_record.total_amount, 'redeemed_at', now());
END;
$$;

-- ============================================================
-- FIX 3: auto_redeem_sale_token (used by HybridPostSaleWizard)
-- Same INNER JOIN bug + missing mixer override handling
-- ============================================================
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
  v_slot_idx int := 0;
  v_override_product_id uuid;
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
      FROM cocktail_ingredients ci 
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
      ORDER BY ci.created_at
    LOOP
      -- Resolve effective product for mixer slots
      v_effective_product_id := v_ingredient.product_id;
      v_effective_product_name := v_ingredient.product_name;

      IF v_ingredient.is_mixer_slot THEN
        IF p_mixer_overrides IS NOT NULL THEN
          SELECT (mo->>'product_id')::uuid INTO v_override_product_id
          FROM jsonb_array_elements(p_mixer_overrides) mo
          WHERE (mo->>'slot_index')::int = v_slot_idx;
          IF v_override_product_id IS NOT NULL THEN
            v_effective_product_id := v_override_product_id;
            SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
          END IF;
        END IF;
        v_slot_idx := v_slot_idx + 1;
      END IF;

      -- Skip unresolved mixer slots
      IF v_effective_product_id IS NULL THEN
        CONTINUE;
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
          'unit', COALESCE(v_ingredient.unit, 'ud')
        ));
      END IF;
    END LOOP;
  END LOOP;

  IF NOT v_stock_ok THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'stock_insufficient',
      'message', 'Stock insuficiente para auto-canje. QR queda pendiente para canje manual.',
      'missing_items', v_preflight_errors, 'bar_name', v_bar_name
    );
  END IF;

  -- ═══ PHASE 2: Consume stock ═══
  v_slot_idx := 0;
  FOR v_item IN
    SELECT si.*, c.name as cocktail_name, c.id as cocktail_id
    FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci 
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id
      ORDER BY ci.created_at
    LOOP
      v_effective_product_id := v_ingredient.product_id;
      v_effective_product_name := v_ingredient.product_name;

      IF v_ingredient.is_mixer_slot THEN
        IF p_mixer_overrides IS NOT NULL THEN
          SELECT (mo->>'product_id')::uuid INTO v_override_product_id
          FROM jsonb_array_elements(p_mixer_overrides) mo
          WHERE (mo->>'slot_index')::int = v_slot_idx;
          IF v_override_product_id IS NOT NULL THEN
            v_effective_product_id := v_override_product_id;
            SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
          END IF;
        END IF;
        v_slot_idx := v_slot_idx + 1;
      END IF;

      IF v_effective_product_id IS NULL THEN
        CONTINUE;
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
          'product_id', v_effective_product_id, 'product_name', v_effective_product_name,
          'quantity', v_ingredient.quantity * v_item.quantity, 'lots', v_consumption_result->'lots'
        );
      ELSE
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_effective_product_name,
          'required_qty', v_ingredient.quantity * v_item.quantity,
          'unit', COALESCE(v_ingredient.unit, 'ud'), 'error', v_consumption_result->>'error'
        ));
      END IF;
    END LOOP;
  END LOOP;

  -- Mark token as redeemed
  UPDATE pickup_tokens 
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_seller_id, bar_location_id = p_bar_location_id 
  WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata)
  VALUES (
    p_seller_id, v_token_record.id, p_sale_id, 'success'::redemption_result,
    p_bar_location_id, v_token_record.venue_id,
    jsonb_build_object('auto_redeem', true, 'bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients, 'mixer_overrides', COALESCE(p_mixer_overrides, '[]'::jsonb))
  );

  RETURN jsonb_build_object(
    'success', true, 'message', 'Auto-canje ejecutado', 'bar_name', v_bar_name,
    'items', v_items_array, 'consumed', v_consumed_ingredients
  );
END;
$$;

-- ============================================================
-- FIX 4: check_sale_mixer_requirements (used by HybridPostSaleWizard)
-- Same INNER JOIN bug — mixer slots have NULL product_id
-- ============================================================
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
  v_db_category text;
BEGIN
  SELECT venue_id INTO v_venue_id FROM sales WHERE id = p_sale_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALE_NOT_FOUND');
  END IF;

  FOR v_item IN
    SELECT si.cocktail_id, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    FOR v_ingredient IN
      SELECT ci.*
      FROM cocktail_ingredients ci
      WHERE ci.cocktail_id = v_item.cocktail_id
        AND ci.is_mixer_slot = true
      ORDER BY ci.created_at
    LOOP
      -- Map mixer_category to DB category
      IF COALESCE(v_ingredient.mixer_category, 'latas') = 'redbull' THEN
        v_db_category := 'redbull';
      ELSE
        v_db_category := 'mixers_tradicionales';
      END IF;

      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
      INTO v_available_mixers
      FROM products p
      WHERE p.category = v_db_category
        AND p.venue_id = v_venue_id;

      v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
        'slot_index', v_slot_index,
        'label', v_item.cocktail_name || ' — Mixer',
        'mixer_category', COALESCE(v_ingredient.mixer_category, 'latas'),
        'default_product_id', '',
        'default_product_name', '',
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
