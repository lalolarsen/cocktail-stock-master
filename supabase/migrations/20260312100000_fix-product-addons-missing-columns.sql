-- Fix missing columns/enum values + remove delivered_by_worker_id from redeem flow
--
-- 1. product_addons.product_id / product_addons.quantity_ml
-- 2. pickup_redemptions_log.jornada_id
-- 3. redemption_result enum: 'insufficient_stock', 'not_paid'
-- 4. Rewrite redeem_pickup_token without delivered_by_worker_id in any INSERT
--    (worker tracking will be handled via bar login session, not per-redemption)

-- Fix 1: product_addons missing columns
ALTER TABLE public.product_addons
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_ml numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_product_addons_product_id ON public.product_addons(product_id)
  WHERE product_id IS NOT NULL;

-- Fix 2: pickup_redemptions_log.jornada_id (was never added)
ALTER TABLE public.pickup_redemptions_log
  ADD COLUMN IF NOT EXISTS jornada_id uuid REFERENCES public.jornadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_log_jornada_id
  ON public.pickup_redemptions_log(jornada_id)
  WHERE jornada_id IS NOT NULL;

-- Fix 3: missing redemption_result enum values
ALTER TYPE public.redemption_result ADD VALUE IF NOT EXISTS 'insufficient_stock';
ALTER TYPE public.redemption_result ADD VALUE IF NOT EXISTS 'not_paid';

-- Fix 4: rewrite redeem_pickup_token removing delivered_by_worker_id from all INSERTs
-- Keep p_delivered_by_worker_id param (DEFAULT NULL) so existing callers don't break,
-- but ignore it — worker tracking is done at the bar login level.
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
  v_is_short_code boolean := false;
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

  -- Detect if p_token is a 6-digit short code
  v_is_short_code := (p_token ~ '^\d{6}$');

  -- STEP 1: Rate limit check
  IF v_is_short_code THEN
    SELECT prl.redeemed_at INTO v_last_attempt
    FROM pickup_redemptions_log prl
    JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
    WHERE pt.short_code = p_token AND pt.status = 'issued'
      AND prl.bartender_id = v_bartender_id
      AND prl.redeemed_at > now() - (v_rate_limit_seconds || ' seconds')::interval
    ORDER BY prl.redeemed_at DESC
    LIMIT 1;
  ELSE
    SELECT prl.redeemed_at INTO v_last_attempt
    FROM pickup_redemptions_log prl
    JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
    WHERE pt.token = p_token
      AND prl.bartender_id = v_bartender_id
      AND prl.redeemed_at > now() - (v_rate_limit_seconds || ' seconds')::interval
    ORDER BY prl.redeemed_at DESC
    LIMIT 1;
  END IF;

  IF v_last_attempt IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TOO_FAST', 'message', 'Espera un momento antes de escanear de nuevo');
  END IF;

  -- STEP 2: Find and LOCK the token
  IF v_is_short_code THEN
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
    WHERE pt.short_code = p_token AND pt.status = 'issued'
    FOR UPDATE OF pt;
  ELSE
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
  END IF;

  IF NOT FOUND THEN
    DECLARE v_fallback_venue uuid;
    BEGIN
      SELECT id INTO v_fallback_venue FROM venues LIMIT 1;
      INSERT INTO pickup_redemptions_log (bartender_id, result, metadata, pos_id, venue_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid),
              'not_found', jsonb_build_object('raw_token', p_token), p_bartender_bar_id, v_fallback_venue);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_NOT_FOUND', 'message', 'Token no encontrado');
  END IF;

  v_venue_id := v_token_record.venue_id;
  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_venue_id;

  -- STEP 3: Validate token status
  IF v_token_record.status = 'redeemed' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id)
    VALUES (v_token_record.id, v_bartender_id, 'already_redeemed', p_bartender_bar_id, v_venue_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_REDEEMED', 'message', 'Este QR ya fue canjeado');
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id)
    VALUES (v_token_record.id, v_bartender_id, 'cancelled', p_bartender_bar_id, v_venue_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  IF v_token_record.status = 'expired' OR (v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now()) THEN
    IF v_token_record.status != 'expired' THEN
      UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    END IF;
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id)
    VALUES (v_token_record.id, v_bartender_id, 'expired', p_bartender_bar_id, v_venue_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'QR vencido');
  END IF;

  IF v_token_record.status != 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATUS', 'message', 'Estado inválido: ' || v_token_record.status);
  END IF;

  IF v_token_record.sale_id IS NOT NULL AND v_token_record.is_cancelled = true THEN
    UPDATE pickup_tokens SET status = 'cancelled' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id)
    VALUES (v_token_record.id, v_bartender_id, 'cancelled', p_bartender_bar_id, v_venue_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- STEP 4: Determine bar location
  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id, v_token_record.bar_location_id);

  IF v_bar_location_id IS NOT NULL THEN
    SELECT name INTO v_bar_name FROM stock_locations WHERE id = v_bar_location_id;
  END IF;

  SELECT id INTO v_active_jornada_id
  FROM jornadas
  WHERE venue_id = v_venue_id AND estado = 'abierta'
  ORDER BY created_at DESC LIMIT 1;

  -- STEP 5: Process by source type
  IF v_token_record.source_type = 'ticket' THEN
    -- COVER TOKEN
    v_ticket_number := v_token_record.ticket_number;

    IF v_token_record.cover_cocktail_id IS NOT NULL AND v_bar_location_id IS NOT NULL AND NOT COALESCE(v_venue_is_demo, false) THEN
      SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;

      IF FOUND THEN
        FOR v_ingredient IN
          SELECT ci.*, p.name as product_name, p.unit
          FROM cocktail_ingredients ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.cocktail_id = v_cocktail.id AND ci.product_id IS NOT NULL
        LOOP
          v_effective_product_id := v_ingredient.product_id;
          v_effective_product_name := v_ingredient.product_name;

          IF v_ingredient.is_mixer_slot AND v_safe_overrides IS NOT NULL THEN
            BEGIN
              SELECT (elem->>'product_id')::uuid INTO v_override_product_id
              FROM jsonb_array_elements(v_safe_overrides) AS elem
              WHERE (elem->>'ingredient_index')::int = v_ingredient_index;
              IF v_override_product_id IS NOT NULL THEN
                SELECT id, name INTO v_effective_product_id, v_effective_product_name
                FROM products WHERE id = v_override_product_id;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          v_ingredient_index := v_ingredient_index + 1;

          DECLARE v_available numeric;
          BEGIN
            SELECT COALESCE(sb.quantity, 0) INTO v_available
            FROM stock_balances sb
            WHERE sb.product_id = v_effective_product_id AND sb.location_id = v_bar_location_id;

            IF COALESCE(v_available, 0) < (v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1)) THEN
              v_missing_items := v_missing_items || jsonb_build_object(
                'product_name', v_effective_product_name,
                'required_qty', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
                'available_qty', COALESCE(v_available, 0),
                'unit', v_ingredient.unit
              );
            END IF;
          END;
        END LOOP;
      END IF;
    END IF;

    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, metadata, pos_id, venue_id)
      VALUES (v_token_record.id, v_bartender_id, 'insufficient_stock',
              jsonb_build_object('missing', v_missing_items), p_bartender_bar_id, v_venue_id);
      RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en barra', 'missing', v_missing_items);
    END IF;

    IF v_token_record.cover_cocktail_id IS NOT NULL AND v_bar_location_id IS NOT NULL AND NOT COALESCE(v_venue_is_demo, false) THEN
      v_ingredient_index := 0;
      FOR v_ingredient IN
        SELECT ci.*, p.name as product_name
        FROM cocktail_ingredients ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.cocktail_id = v_token_record.cover_cocktail_id AND ci.product_id IS NOT NULL
      LOOP
        v_effective_product_id := v_ingredient.product_id;
        v_effective_product_name := v_ingredient.product_name;

        IF v_ingredient.is_mixer_slot AND v_safe_overrides IS NOT NULL THEN
          BEGIN
            SELECT (elem->>'product_id')::uuid INTO v_override_product_id
            FROM jsonb_array_elements(v_safe_overrides) AS elem
            WHERE (elem->>'ingredient_index')::int = v_ingredient_index;
            IF v_override_product_id IS NOT NULL THEN
              SELECT id, name INTO v_effective_product_id, v_effective_product_name
              FROM products WHERE id = v_override_product_id;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;
        v_ingredient_index := v_ingredient_index + 1;

        UPDATE stock_balances
        SET quantity = quantity - (v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1)), updated_at = now()
        WHERE product_id = v_effective_product_id AND location_id = v_bar_location_id;

        INSERT INTO stock_movements (product_id, quantity, movement_type, notes, from_location_id, pickup_token_id, venue_id)
        VALUES (v_effective_product_id, v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1), 'salida',
                'Retiro cover - ' || COALESCE(v_ticket_number, 'ticket'),
                v_bar_location_id, v_token_record.id, v_venue_id);

        v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
          'product_id', v_effective_product_id, 'product_name', v_effective_product_name,
          'quantity', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1)
        );
      END LOOP;
    END IF;

    UPDATE pickup_tokens
    SET status = 'redeemed', redeemed_at = now(), bar_location_id = v_bar_location_id
    WHERE id = v_token_record.id;

    SELECT name INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    v_deliver := jsonb_build_object(
      'type', 'cover',
      'name', COALESCE(v_cocktail.name, 'Cover'),
      'quantity', COALESCE(v_token_record.cover_quantity, 1)
    );

    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, metadata, pos_id, jornada_id, venue_id)
    VALUES (v_token_record.id, v_bartender_id, 'success',
            jsonb_build_object('deliver', v_deliver, 'bar', v_bar_name, 'consumed', v_consumed_ingredients),
            p_bartender_bar_id, v_active_jornada_id, v_venue_id);

    RETURN jsonb_build_object('success', true, 'deliver', v_deliver, 'bar_name', v_bar_name);

  ELSE
    -- SALE TOKEN
    IF v_bar_location_id IS NOT NULL AND NOT COALESCE(v_venue_is_demo, false) THEN
      FOR v_item IN
        SELECT si.cocktail_id, si.quantity as sale_qty, c.name as cocktail_name
        FROM sale_items si
        JOIN cocktails c ON c.id = si.cocktail_id
        WHERE si.sale_id = v_token_record.sale_id
      LOOP
        v_ingredient_index := 0;
        FOR v_ingredient IN
          SELECT ci.*, p.name as product_name, p.unit
          FROM cocktail_ingredients ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL
        LOOP
          v_effective_product_id := v_ingredient.product_id;
          v_effective_product_name := v_ingredient.product_name;

          IF v_ingredient.is_mixer_slot AND v_safe_overrides IS NOT NULL THEN
            BEGIN
              SELECT (elem->>'product_id')::uuid INTO v_override_product_id
              FROM jsonb_array_elements(v_safe_overrides) AS elem
              WHERE (elem->>'ingredient_index')::int = v_ingredient_index;
              IF v_override_product_id IS NOT NULL THEN
                SELECT id, name INTO v_effective_product_id, v_effective_product_name
                FROM products WHERE id = v_override_product_id;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          v_ingredient_index := v_ingredient_index + 1;

          DECLARE v_avail numeric;
          BEGIN
            SELECT COALESCE(sb.quantity, 0) INTO v_avail
            FROM stock_balances sb
            WHERE sb.product_id = v_effective_product_id AND sb.location_id = v_bar_location_id;

            IF COALESCE(v_avail, 0) < (v_ingredient.quantity * v_item.sale_qty) THEN
              v_missing_items := v_missing_items || jsonb_build_object(
                'product_name', v_effective_product_name,
                'required_qty', v_ingredient.quantity * v_item.sale_qty,
                'available_qty', COALESCE(v_avail, 0),
                'unit', v_ingredient.unit
              );
            END IF;
          END;
        END LOOP;

        v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.sale_qty);
      END LOOP;
    ELSE
      FOR v_item IN
        SELECT si.cocktail_id, si.quantity as sale_qty, c.name as cocktail_name
        FROM sale_items si
        JOIN cocktails c ON c.id = si.cocktail_id
        WHERE si.sale_id = v_token_record.sale_id
      LOOP
        v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.sale_qty);
      END LOOP;
    END IF;

    IF jsonb_array_length(v_missing_items) > 0 THEN
      INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, metadata, pos_id, venue_id)
      VALUES (v_token_record.id, v_bartender_id, 'insufficient_stock',
              jsonb_build_object('missing', v_missing_items), p_bartender_bar_id, v_venue_id);
      RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_BAR_STOCK', 'message', 'Stock insuficiente en barra', 'missing', v_missing_items);
    END IF;

    IF v_bar_location_id IS NOT NULL AND NOT COALESCE(v_venue_is_demo, false) THEN
      FOR v_item IN
        SELECT si.cocktail_id, si.quantity as sale_qty, c.name as cocktail_name
        FROM sale_items si
        JOIN cocktails c ON c.id = si.cocktail_id
        WHERE si.sale_id = v_token_record.sale_id
      LOOP
        SELECT jsonb_agg(jsonb_build_object('product_id', pa.product_id, 'quantity_ml', pa.quantity_ml, 'product_name', p.name))
        INTO v_item_addons
        FROM sale_item_addons sia
        JOIN product_addons pa ON pa.id = sia.addon_id
        JOIN products p ON p.id = pa.product_id
        WHERE sia.sale_item_id IN (
          SELECT id FROM sale_items WHERE sale_id = v_token_record.sale_id AND cocktail_id = v_item.cocktail_id
        ) AND pa.product_id IS NOT NULL;

        v_ingredient_index := 0;
        FOR v_ingredient IN
          SELECT ci.*, p.name as product_name
          FROM cocktail_ingredients ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL
        LOOP
          v_effective_product_id := v_ingredient.product_id;
          v_effective_product_name := v_ingredient.product_name;

          IF v_ingredient.is_mixer_slot AND v_safe_overrides IS NOT NULL THEN
            BEGIN
              SELECT (elem->>'product_id')::uuid INTO v_override_product_id
              FROM jsonb_array_elements(v_safe_overrides) AS elem
              WHERE (elem->>'ingredient_index')::int = v_ingredient_index;
              IF v_override_product_id IS NOT NULL THEN
                SELECT id, name INTO v_effective_product_id, v_effective_product_name
                FROM products WHERE id = v_override_product_id;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          v_ingredient_index := v_ingredient_index + 1;

          UPDATE stock_balances
          SET quantity = quantity - (v_ingredient.quantity * v_item.sale_qty), updated_at = now()
          WHERE product_id = v_effective_product_id AND location_id = v_bar_location_id;

          INSERT INTO stock_movements (product_id, quantity, movement_type, notes, from_location_id, pickup_token_id, venue_id)
          VALUES (v_effective_product_id, v_ingredient.quantity * v_item.sale_qty, 'salida',
                  'Retiro venta ' || COALESCE(v_token_record.sale_number, '?'),
                  v_bar_location_id, v_token_record.id, v_venue_id);

          v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
            'product_id', v_effective_product_id, 'product_name', v_effective_product_name,
            'quantity', v_ingredient.quantity * v_item.sale_qty
          );
        END LOOP;

        IF v_item_addons IS NOT NULL AND jsonb_array_length(v_item_addons) > 0 THEN
          FOR v_ingredient IN
            SELECT (elem->>'product_id')::uuid as product_id,
                   (elem->>'quantity_ml')::numeric as quantity,
                   elem->>'product_name' as product_name
            FROM jsonb_array_elements(v_item_addons) AS elem
          LOOP
            UPDATE stock_balances
            SET quantity = quantity - (v_ingredient.quantity * v_item.sale_qty), updated_at = now()
            WHERE product_id = v_ingredient.product_id AND location_id = v_bar_location_id;

            INSERT INTO stock_movements (product_id, quantity, movement_type, notes, from_location_id, pickup_token_id, venue_id)
            VALUES (v_ingredient.product_id, v_ingredient.quantity * v_item.sale_qty, 'salida',
                    'Addon retiro venta ' || COALESCE(v_token_record.sale_number, '?'),
                    v_bar_location_id, v_token_record.id, v_venue_id);

            v_consumed_ingredients := v_consumed_ingredients || jsonb_build_object(
              'product_id', v_ingredient.product_id, 'product_name', v_ingredient.product_name,
              'quantity', v_ingredient.quantity * v_item.sale_qty
            );
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    UPDATE pickup_tokens
    SET status = 'redeemed', redeemed_at = now(), bar_location_id = v_bar_location_id
    WHERE id = v_token_record.id;

    v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array);

    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, metadata, pos_id, jornada_id, venue_id)
    VALUES (v_token_record.id, v_bartender_id, 'success',
            jsonb_build_object('deliver', v_deliver, 'bar', v_bar_name, 'sale_number', v_token_record.sale_number, 'consumed', v_consumed_ingredients),
            p_bartender_bar_id, v_active_jornada_id, v_venue_id);

    RETURN jsonb_build_object('success', true, 'deliver', v_deliver, 'bar_name', v_bar_name);
  END IF;
END;
$function$;

COMMENT ON FUNCTION redeem_pickup_token(text, uuid, jsonb, uuid) IS
'Accepts hex token OR 6-digit short_code. p_delivered_by_worker_id kept for API compatibility but ignored — worker tracking is done at bar login level.';
