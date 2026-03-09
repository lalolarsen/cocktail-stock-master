
-- Hardening: redeem_pickup_token — atomic stock consumption
--
-- Root cause of the bug:
--   consume_stock_fefo() writes to stock_lots/stock_movements/stock_balances immediately.
--   The old loop continued iterating after a failure and returned success:false in JSON,
--   but previous successful consume_stock_fefo() calls were already committed.
--
-- Fix — two-phase approach:
--   PHASE 1 (pre-check, read-only): Validate ALL ingredients are available before writing
--             anything. If any ingredient is short, return error immediately — zero writes.
--   PHASE 2 (consume, write): Only runs if phase 1 passes. Each consume is wrapped in a
--             BEGIN...EXCEPTION block so that even a race-condition failure raises a
--             PostgreSQL exception, which rolls back ALL previous consume_stock_fefo()
--             writes within the block.

DROP FUNCTION IF EXISTS public.redeem_pickup_token(text, uuid);
DROP FUNCTION IF EXISTS public.redeem_pickup_token(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.redeem_pickup_token(text, uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.redeem_pickup_token(
  p_token text,
  p_bartender_bar_id uuid DEFAULT NULL::uuid,
  p_mixer_overrides jsonb DEFAULT NULL::jsonb,
  p_delivered_by_worker_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_safe_overrides jsonb;
  -- Pre-check helpers
  v_avail numeric;
  v_required numeric;
BEGIN
  v_bartender_id := auth.uid();

  -- Normalize p_mixer_overrides
  IF p_mixer_overrides IS NOT NULL THEN
    IF jsonb_typeof(p_mixer_overrides) = 'string' THEN
      BEGIN
        v_safe_overrides := (p_mixer_overrides #>> '{}')::jsonb;
        IF jsonb_typeof(v_safe_overrides) <> 'array' THEN
          v_safe_overrides := NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_safe_overrides := NULL;
      END;
    ELSIF jsonb_typeof(p_mixer_overrides) = 'array' THEN
      v_safe_overrides := p_mixer_overrides;
    ELSE
      v_safe_overrides := NULL;
    END IF;
  ELSE
    v_safe_overrides := NULL;
  END IF;

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
      INSERT INTO pickup_redemptions_log (bartender_id, result, metadata, pos_id, venue_id, delivered_by_worker_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 'not_found', jsonb_build_object('raw_token', p_token), p_bartender_bar_id, v_fallback_venue, p_delivered_by_worker_id);
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
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'already_redeemed', v_bar_location_id, v_venue_id, jsonb_build_object('original_redeemed_at', v_token_record.redeemed_at, 'bar_name', v_bar_name), p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_REDEEMED', 'message', 'Este QR ya fue canjeado', 'deliver', v_deliver, 'previously_redeemed_at', v_token_record.redeemed_at);
  END IF;

  IF v_token_record.status = 'expired' OR (v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now()) THEN
    UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'expired', v_bar_location_id, v_venue_id, jsonb_build_object('expired_at', v_token_record.expires_at, 'bar_name', v_bar_name), p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'Token expirado');
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'cancelled', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name), p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- STEP 5: Get active jornada
  SELECT id INTO v_active_jornada_id FROM jornadas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;
  IF v_active_jornada_id IS NULL THEN
    v_active_jornada_id := v_token_record.sale_jornada_id;
  END IF;

  -- ════════════════════════════════════════════════════════════════
  -- STEP 6: Process COVER TOKEN
  -- ════════════════════════════════════════════════════════════════
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    IF NOT FOUND THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'not_found', v_bar_location_id, v_venue_id, jsonb_build_object('error', 'cocktail_not_found', 'cocktail_id', v_token_record.cover_cocktail_id), p_delivered_by_worker_id);
      RETURN jsonb_build_object('success', false, 'error_code', 'COCKTAIL_NOT_FOUND', 'message', 'Cocktail no encontrado');
    END IF;

    -- ── PHASE 1 (COVER): Pre-check all ingredients — read-only, no writes ──
    -- Collects ALL missing items so the bartender gets a complete picture.
    v_missing_items := '[]'::jsonb;
    v_ingredient_index := 0;
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.unit
      FROM cocktail_ingredients ci
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_cocktail.id
      ORDER BY ci.created_at
    LOOP
      v_effective_product_id := v_ingredient.product_id;
      v_effective_product_name := v_ingredient.product_name;

      IF v_ingredient.is_mixer_slot THEN
        IF v_safe_overrides IS NOT NULL THEN
          SELECT (elem->>'product_id')::uuid INTO v_override_product_id
          FROM jsonb_array_elements(v_safe_overrides) elem
          WHERE (elem->>'slot_index')::int = v_ingredient_index;
          IF v_override_product_id IS NOT NULL THEN
            v_effective_product_id := v_override_product_id;
            SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
          END IF;
        END IF;
        v_ingredient_index := v_ingredient_index + 1;
      END IF;

      IF v_effective_product_id IS NULL THEN CONTINUE; END IF;

      v_required := v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1);

      SELECT COALESCE(SUM(sl.quantity), 0) INTO v_avail
      FROM stock_lots sl
      WHERE sl.product_id = v_effective_product_id
        AND sl.location_id = v_bar_location_id
        AND sl.quantity > 0
        AND sl.is_depleted = false
        AND (sl.expires_at IS NULL OR sl.expires_at >= CURRENT_DATE);

      IF v_avail < v_required THEN
        v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
          'product_name', v_effective_product_name,
          'required_qty', v_required,
          'available_qty', v_avail,
          'unit', COALESCE(v_ingredient.unit, 'ud'),
          'error', 'INSUFFICIENT_STOCK'
        ));
      END IF;
    END LOOP;

    -- If any ingredient is short, abort here — nothing was written.
    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id, v_venue_id, jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'phase', 'pre_check'), p_delivered_by_worker_id);
      v_deliver := jsonb_build_object('type', 'cover', 'name', v_cocktail.name, 'quantity', COALESCE(v_token_record.cover_quantity, 1), 'source', 'ticket');
      RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en esta barra', 'bar_name', v_bar_name, 'deliver', v_deliver, 'missing', v_missing_items);
    END IF;

    -- ── PHASE 2 (COVER): Atomic consumption — wrapped in BEGIN...EXCEPTION ──
    -- Any consume_stock_fefo failure (race condition) raises an exception,
    -- which rolls back ALL stock writes performed within this block.
    BEGIN
      v_ingredient_index := 0;
      FOR v_ingredient IN
        SELECT ci.*, p.name as product_name, p.unit
        FROM cocktail_ingredients ci
        LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.cocktail_id = v_cocktail.id
        ORDER BY ci.created_at
      LOOP
        v_effective_product_id := v_ingredient.product_id;
        v_effective_product_name := v_ingredient.product_name;

        IF v_ingredient.is_mixer_slot THEN
          IF v_safe_overrides IS NOT NULL THEN
            SELECT (elem->>'product_id')::uuid INTO v_override_product_id
            FROM jsonb_array_elements(v_safe_overrides) elem
            WHERE (elem->>'slot_index')::int = v_ingredient_index;
            IF v_override_product_id IS NOT NULL THEN
              v_effective_product_id := v_override_product_id;
              SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
            END IF;
          END IF;
          v_ingredient_index := v_ingredient_index + 1;
        END IF;

        IF v_effective_product_id IS NULL THEN CONTINUE; END IF;

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
          -- Track the failing ingredient and raise — ALL previous writes in this block roll back
          v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
            'product_name', v_effective_product_name,
            'required_qty', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
            'unit', COALESCE(v_ingredient.unit, 'ud'),
            'error', v_consumption_result->>'error',
            'race_condition', true
          ));
          RAISE EXCEPTION 'INSUFFICIENT_BAR_STOCK';
        END IF;
      END LOOP;

      -- All ingredients consumed successfully
      UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id, bar_location_id = v_bar_location_id WHERE id = v_token_record.id;
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients), p_delivered_by_worker_id);
      v_deliver := jsonb_build_object('type', 'cover', 'name', v_cocktail.name, 'quantity', COALESCE(v_token_record.cover_quantity, 1), 'source', 'ticket', 'ticket_number', v_token_record.ticket_number);
      RETURN jsonb_build_object('success', true, 'message', 'Canje exitoso', 'deliver', v_deliver, 'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name), 'redeemed_at', now());

    EXCEPTION WHEN OTHERS THEN
      -- v_missing_items was populated before RAISE — DB writes above are rolled back
      INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id, v_venue_id, jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'phase', 'consume', 'race_condition', true), p_delivered_by_worker_id);
      v_deliver := jsonb_build_object('type', 'cover', 'name', v_cocktail.name, 'quantity', COALESCE(v_token_record.cover_quantity, 1), 'source', 'ticket');
      RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en esta barra', 'bar_name', v_bar_name, 'deliver', v_deliver, 'missing', v_missing_items);
    END;
  END IF;

  -- ════════════════════════════════════════════════════════════════
  -- STEP 7: REGULAR SALE TOKEN
  -- ════════════════════════════════════════════════════════════════
  IF v_token_record.payment_status != 'paid' THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'not_paid', v_bar_location_id, v_venue_id, jsonb_build_object('payment_status', v_token_record.payment_status, 'bar_name', v_bar_name), p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'PAYMENT_NOT_CONFIRMED', 'message', 'Pago no confirmado');
  END IF;

  IF v_token_record.is_cancelled = true THEN
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'cancelled', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name), p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- ── PHASE 1 (SALE): Pre-check all ingredients across all items — read-only, no writes ──
  v_missing_items := '[]'::jsonb;
  FOR v_item IN
    SELECT si.*, c.id as cocktail_id, c.name as cocktail_name
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = v_token_record.sale_id
  LOOP
    FOR i IN 1..v_item.quantity LOOP
      v_ingredient_index := 0;
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
          IF v_safe_overrides IS NOT NULL THEN
            SELECT (elem->>'product_id')::uuid INTO v_override_product_id
            FROM jsonb_array_elements(v_safe_overrides) elem
            WHERE (elem->>'slot_index')::int = v_ingredient_index;
            IF v_override_product_id IS NOT NULL THEN
              v_effective_product_id := v_override_product_id;
              SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
            END IF;
          END IF;
          v_ingredient_index := v_ingredient_index + 1;
        END IF;

        IF v_effective_product_id IS NULL THEN CONTINUE; END IF;

        v_required := v_ingredient.quantity;

        SELECT COALESCE(SUM(sl.quantity), 0) INTO v_avail
        FROM stock_lots sl
        WHERE sl.product_id = v_effective_product_id
          AND sl.location_id = v_bar_location_id
          AND sl.quantity > 0
          AND sl.is_depleted = false
          AND (sl.expires_at IS NULL OR sl.expires_at >= CURRENT_DATE);

        IF v_avail < v_required THEN
          v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
            'product_name', v_effective_product_name,
            'cocktail_name', v_item.cocktail_name,
            'required_qty', v_required,
            'available_qty', v_avail,
            'unit', COALESCE(v_ingredient.unit, 'ud'),
            'error', 'INSUFFICIENT_STOCK'
          ));
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- If any ingredient is short, abort here — nothing was written.
  IF jsonb_array_length(v_missing_items) > 0 THEN
    -- Build items array for the deliver payload
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', c.name, 'quantity', si.quantity, 'addons', COALESCE((SELECT jsonb_agg(sia.addon_name) FROM sale_item_addons sia WHERE sia.sale_item_id = si.id), '[]'::jsonb))), '[]'::jsonb)
    INTO v_items_array FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id WHERE si.sale_id = v_token_record.sale_id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id, v_venue_id, jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'phase', 'pre_check'), p_delivered_by_worker_id);
    v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array, 'source', 'sale', 'sale_number', v_token_record.sale_number);
    RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en esta barra', 'bar_name', v_bar_name, 'deliver', v_deliver, 'missing', v_missing_items);
  END IF;

  -- ── PHASE 2 (SALE): Atomic consumption — wrapped in BEGIN...EXCEPTION ──
  BEGIN
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
          v_effective_product_id := v_ingredient.product_id;
          v_effective_product_name := v_ingredient.product_name;

          IF v_ingredient.is_mixer_slot THEN
            IF v_safe_overrides IS NOT NULL THEN
              SELECT (elem->>'product_id')::uuid INTO v_override_product_id
              FROM jsonb_array_elements(v_safe_overrides) elem
              WHERE (elem->>'slot_index')::int = v_ingredient_index;
              IF v_override_product_id IS NOT NULL THEN
                v_effective_product_id := v_override_product_id;
                SELECT name INTO v_effective_product_name FROM products WHERE id = v_effective_product_id;
              END IF;
            END IF;
            v_ingredient_index := v_ingredient_index + 1;
          END IF;

          IF v_effective_product_id IS NULL THEN CONTINUE; END IF;

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
            -- Track the failing ingredient and raise — ALL previous writes in this block roll back
            v_missing_items := v_missing_items || jsonb_build_array(jsonb_build_object(
              'product_name', v_effective_product_name,
              'cocktail_name', v_item.cocktail_name,
              'required_qty', v_ingredient.quantity,
              'unit', COALESCE(v_ingredient.unit, 'ud'),
              'error', v_consumption_result->>'error',
              'race_condition', true
            ));
            RAISE EXCEPTION 'INSUFFICIENT_BAR_STOCK';
          END IF;
        END LOOP;
      END LOOP;

      v_items_array := v_items_array || jsonb_build_array(jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity, 'addons', v_item_addons));
    END LOOP;

    -- All items consumed successfully
    UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), redeemed_by = v_bartender_id, bar_location_id = v_bar_location_id WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'success', v_bar_location_id, v_venue_id, jsonb_build_object('bar_name', v_bar_name, 'jornada_id', v_active_jornada_id, 'ingredients_consumed', v_consumed_ingredients), p_delivered_by_worker_id);
    v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array, 'source', 'sale', 'sale_number', v_token_record.sale_number);
    RETURN jsonb_build_object('success', true, 'message', 'Canje exitoso', 'deliver', v_deliver, 'bar_location', jsonb_build_object('id', v_bar_location_id, 'name', v_bar_name), 'sale_number', v_token_record.sale_number, 'total_amount', v_token_record.total_amount, 'redeemed_at', now());

  EXCEPTION WHEN OTHERS THEN
    -- v_missing_items was populated before RAISE — DB writes above are rolled back
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', c.name, 'quantity', si.quantity)), '[]'::jsonb)
    INTO v_items_array FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id WHERE si.sale_id = v_token_record.sale_id;
    INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, delivered_by_worker_id)
    VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), v_token_record.id, v_token_record.sale_id, 'stock_error', v_bar_location_id, v_venue_id, jsonb_build_object('missing', v_missing_items, 'bar_name', v_bar_name, 'phase', 'consume', 'race_condition', true), p_delivered_by_worker_id);
    v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array, 'source', 'sale', 'sale_number', v_token_record.sale_number);
    RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en esta barra', 'bar_name', v_bar_name, 'deliver', v_deliver, 'missing', v_missing_items);
  END;
END;
$function$;
