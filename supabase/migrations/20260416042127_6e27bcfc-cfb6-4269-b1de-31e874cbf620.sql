
-- =============================================
-- ETAPA 1: Agregar columnas a pickup_redemptions_log
-- =============================================
ALTER TABLE pickup_redemptions_log
  ADD COLUMN IF NOT EXISTS theoretical_consumption JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS items_snapshot JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bar_location_id UUID REFERENCES stock_locations(id) DEFAULT NULL;

-- =============================================
-- ETAPA 2: Reescribir redeem_pickup_token (4 params) sin stock
-- =============================================
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
  v_venue_is_demo boolean := false;
  v_item record;
  v_deliver jsonb;
  v_ticket_number text;
  v_items_array jsonb := '[]'::jsonb;
  v_last_attempt timestamptz;
  v_rate_limit_seconds constant int := 2;
  v_bartender_id uuid;
  v_theoretical_consumption jsonb := '[]'::jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_item_addons jsonb;
  v_venue_id uuid;
  v_is_short_code boolean := false;
  v_frozen boolean := false;
BEGIN
  v_bartender_id := auth.uid();
  v_is_short_code := (p_token ~ '^\d{6}$');

  -- Rate limit check
  IF v_is_short_code THEN
    SELECT prl.redeemed_at INTO v_last_attempt
    FROM pickup_redemptions_log prl
    JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
    WHERE pt.short_code = p_token AND pt.status = 'issued'
      AND prl.bartender_id = v_bartender_id
      AND prl.redeemed_at > now() - (v_rate_limit_seconds || ' seconds')::interval
    ORDER BY prl.redeemed_at DESC LIMIT 1;
  ELSE
    SELECT prl.redeemed_at INTO v_last_attempt
    FROM pickup_redemptions_log prl
    JOIN pickup_tokens pt ON pt.id = prl.pickup_token_id
    WHERE pt.token = p_token
      AND prl.bartender_id = v_bartender_id
      AND prl.redeemed_at > now() - (v_rate_limit_seconds || ' seconds')::interval
    ORDER BY prl.redeemed_at DESC LIMIT 1;
  END IF;

  IF v_last_attempt IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TOO_FAST', 'message', 'Espera un momento antes de escanear de nuevo');
  END IF;

  -- Token lookup
  IF v_is_short_code THEN
    SELECT pt.*, s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
           s.bar_location_id as sale_bar_location_id,
           COALESCE(pt.venue_id, s.venue_id, ts.venue_id) as venue_id,
           ts.ticket_number, s.jornada_id as sale_jornada_id
    INTO v_token_record
    FROM pickup_tokens pt
    LEFT JOIN sales s ON s.id = pt.sale_id
    LEFT JOIN ticket_sales ts ON ts.id = pt.ticket_sale_id
    WHERE pt.short_code = p_token AND pt.status = 'issued'
    FOR UPDATE OF pt;
  ELSE
    SELECT pt.*, s.total_amount, s.sale_number, s.payment_status, s.is_cancelled,
           s.bar_location_id as sale_bar_location_id,
           COALESCE(pt.venue_id, s.venue_id, ts.venue_id) as venue_id,
           ts.ticket_number, s.jornada_id as sale_jornada_id
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
      INSERT INTO pickup_redemptions_log (bartender_id, result, metadata, pos_id, venue_id, delivered_by_worker_id)
      VALUES (COALESCE(v_bartender_id, '00000000-0000-0000-0000-000000000000'::uuid), 'not_found', jsonb_build_object('raw_token', p_token), p_bartender_bar_id, v_fallback_venue, p_delivered_by_worker_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_NOT_FOUND', 'message', 'Token no encontrado');
  END IF;

  v_venue_id := v_token_record.venue_id;
  SELECT is_demo INTO v_venue_is_demo FROM venues WHERE id = v_venue_id;
  v_frozen := is_inventory_frozen(v_venue_id);

  -- Status validations
  IF v_token_record.status = 'redeemed' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id, delivered_by_worker_id)
    VALUES (v_token_record.id, v_bartender_id, 'already_redeemed', p_bartender_bar_id, v_venue_id, p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_REDEEMED', 'message', 'Este QR ya fue canjeado');
  END IF;

  IF v_token_record.status = 'cancelled' THEN
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id, delivered_by_worker_id)
    VALUES (v_token_record.id, v_bartender_id, 'cancelled', p_bartender_bar_id, v_venue_id, p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  IF v_token_record.status = 'expired' OR (v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now()) THEN
    IF v_token_record.status != 'expired' THEN
      UPDATE pickup_tokens SET status = 'expired' WHERE id = v_token_record.id;
    END IF;
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id, delivered_by_worker_id)
    VALUES (v_token_record.id, v_bartender_id, 'expired', p_bartender_bar_id, v_venue_id, p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'TOKEN_EXPIRED', 'message', 'QR vencido');
  END IF;

  IF v_token_record.status != 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATUS', 'message', 'Estado inválido: ' || v_token_record.status);
  END IF;

  IF v_token_record.sale_id IS NOT NULL AND v_token_record.is_cancelled = true THEN
    UPDATE pickup_tokens SET status = 'cancelled' WHERE id = v_token_record.id;
    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, pos_id, venue_id, delivered_by_worker_id)
    VALUES (v_token_record.id, v_bartender_id, 'cancelled', p_bartender_bar_id, v_venue_id, p_delivered_by_worker_id);
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CANCELLED', 'message', 'Venta cancelada');
  END IF;

  -- Resolve bar location
  v_bar_location_id := COALESCE(p_bartender_bar_id, v_token_record.sale_bar_location_id, v_token_record.bar_location_id);
  IF v_bar_location_id IS NOT NULL THEN
    SELECT name INTO v_bar_name FROM stock_locations WHERE id = v_bar_location_id;
  END IF;

  -- Get active jornada
  SELECT id INTO v_active_jornada_id
  FROM jornadas WHERE venue_id = v_venue_id AND estado = 'abierta'
  ORDER BY created_at DESC LIMIT 1;

  -- ========== COVER TOKEN ==========
  IF v_token_record.source_type = 'ticket' THEN
    v_ticket_number := v_token_record.ticket_number;

    -- Calculate theoretical consumption (NO stock check, NO stock deduction)
    IF v_token_record.cover_cocktail_id IS NOT NULL THEN
      SELECT * INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
      IF FOUND THEN
        v_items_snapshot := jsonb_build_array(jsonb_build_object(
          'type', 'cover',
          'cocktail_id', v_cocktail.id,
          'cocktail_name', v_cocktail.name,
          'quantity', COALESCE(v_token_record.cover_quantity, 1)
        ));

        FOR v_ingredient IN
          SELECT ci.*, p.name as product_name, p.unit
          FROM cocktail_ingredients ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.cocktail_id = v_cocktail.id AND ci.product_id IS NOT NULL
        LOOP
          v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object(
            'product_id', v_ingredient.product_id,
            'product_name', v_ingredient.product_name,
            'quantity', v_ingredient.quantity * COALESCE(v_token_record.cover_quantity, 1),
            'unit', v_ingredient.unit
          );
        END LOOP;
      END IF;
    END IF;

    UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), bar_location_id = v_bar_location_id WHERE id = v_token_record.id;
    SELECT name INTO v_cocktail FROM cocktails WHERE id = v_token_record.cover_cocktail_id;
    v_deliver := jsonb_build_object('type', 'cover', 'name', COALESCE(v_cocktail.name, 'Cover'), 'quantity', COALESCE(v_token_record.cover_quantity, 1));

    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, metadata, pos_id, jornada_id, venue_id, delivered_by_worker_id, theoretical_consumption, items_snapshot, bar_location_id)
    VALUES (v_token_record.id, v_bartender_id, 'success',
            jsonb_build_object('deliver', v_deliver, 'bar', v_bar_name, 'inventory_frozen', v_frozen),
            p_bartender_bar_id, v_active_jornada_id, v_venue_id, p_delivered_by_worker_id,
            v_theoretical_consumption, v_items_snapshot, v_bar_location_id);

    RETURN jsonb_build_object('success', true, 'deliver', v_deliver, 'bar_name', v_bar_name, 'inventory_frozen', v_frozen);

  ELSE
    -- ========== SALE TOKEN ==========
    -- Calculate theoretical consumption (NO stock check, NO stock deduction)
    FOR v_item IN
      SELECT si.cocktail_id, si.quantity as sale_qty, c.name as cocktail_name
      FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id
      WHERE si.sale_id = v_token_record.sale_id
    LOOP
      v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.sale_qty);
      v_items_snapshot := v_items_snapshot || jsonb_build_object(
        'cocktail_name', v_item.cocktail_name,
        'cocktail_id', v_item.cocktail_id,
        'quantity', v_item.sale_qty
      );

      FOR v_ingredient IN
        SELECT ci.*, p.name as product_name, p.unit
        FROM cocktail_ingredients ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL
      LOOP
        v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object(
          'product_id', v_ingredient.product_id,
          'product_name', v_ingredient.product_name,
          'quantity', v_ingredient.quantity * v_item.sale_qty,
          'unit', COALESCE(v_ingredient.unit, 'ud')
        );
      END LOOP;

      -- Addons theoretical consumption
      SELECT jsonb_agg(jsonb_build_object('addon_id', sia.addon_id, 'product_id', pa.product_id, 'quantity_ml', pa.quantity_ml, 'product_name', p.name))
      INTO v_item_addons
      FROM sale_item_addons sia
      JOIN product_addons pa ON pa.id = sia.addon_id
      JOIN products p ON p.id = pa.product_id
      WHERE sia.sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = v_token_record.sale_id AND cocktail_id = v_item.cocktail_id);

      IF v_item_addons IS NOT NULL AND jsonb_array_length(v_item_addons) > 0 THEN
        FOR v_ingredient IN
          SELECT (elem->>'product_id')::uuid as product_id,
                 (elem->>'quantity_ml')::numeric as quantity,
                 elem->>'product_name' as product_name
          FROM jsonb_array_elements(v_item_addons) AS elem
        LOOP
          v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object(
            'product_id', v_ingredient.product_id,
            'product_name', v_ingredient.product_name,
            'quantity', v_ingredient.quantity * v_item.sale_qty,
            'unit', 'ml'
          );
        END LOOP;
      END IF;
    END LOOP;

    UPDATE pickup_tokens SET status = 'redeemed', redeemed_at = now(), bar_location_id = v_bar_location_id WHERE id = v_token_record.id;
    v_deliver := jsonb_build_object('type', 'menu_items', 'items', v_items_array);

    INSERT INTO pickup_redemptions_log (pickup_token_id, bartender_id, result, metadata, pos_id, jornada_id, venue_id, delivered_by_worker_id, theoretical_consumption, items_snapshot, bar_location_id)
    VALUES (v_token_record.id, v_bartender_id, 'success',
            jsonb_build_object('deliver', v_deliver, 'bar', v_bar_name, 'sale_number', v_token_record.sale_number, 'inventory_frozen', v_frozen),
            p_bartender_bar_id, v_active_jornada_id, v_venue_id, p_delivered_by_worker_id,
            v_theoretical_consumption, v_items_snapshot, v_bar_location_id);

    RETURN jsonb_build_object('success', true, 'deliver', v_deliver, 'bar_name', v_bar_name, 'inventory_frozen', v_frozen);
  END IF;
END;
$function$;

-- =============================================
-- ETAPA 2b: Reescribir auto_redeem_sale_token (3 params) sin stock
-- =============================================
CREATE OR REPLACE FUNCTION public.auto_redeem_sale_token(
  p_sale_id uuid,
  p_bar_location_id uuid,
  p_seller_id uuid DEFAULT NULL::uuid
)
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
  v_item_addons jsonb;
  v_frozen boolean := false;
  v_resolved_venue_id uuid;
BEGIN
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
  FROM jornadas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;

  IF v_active_jornada_id IS NULL THEN
    v_active_jornada_id := v_token_record.jornada_id;
  END IF;

  v_resolved_venue_id := COALESCE(
    v_token_record.venue_id,
    (SELECT venue_id FROM sales WHERE id = p_sale_id),
    '4e128e76-980d-4233-a438-92aa02cfb50b'::uuid
  );

  v_frozen := is_inventory_frozen(v_resolved_venue_id);

  -- Calculate theoretical consumption (NO stock check, NO stock deduction)
  FOR v_item IN
    SELECT si.*, c.name AS cocktail_name, c.id AS cocktail_id
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'cocktail_name', v_item.cocktail_name,
      'cocktail_id', v_item.cocktail_id,
      'quantity', v_item.quantity
    );

    FOR v_ingredient IN
      SELECT ci.*, p.name AS product_name, p.unit
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL
    LOOP
      v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object(
        'product_id', v_ingredient.product_id,
        'product_name', v_ingredient.product_name,
        'quantity', v_ingredient.quantity * v_item.quantity,
        'unit', COALESCE(v_ingredient.unit, 'ud')
      );
    END LOOP;
  END LOOP;

  UPDATE pickup_tokens
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_seller_id, bar_location_id = p_bar_location_id
  WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, theoretical_consumption, items_snapshot, bar_location_id)
  VALUES (p_seller_id, v_token_record.id, p_sale_id, 'success'::redemption_result, p_bar_location_id,
    v_resolved_venue_id, jsonb_build_object(
      'auto_redeem', true, 
      'bar_name', v_bar_name, 
      'jornada_id', v_active_jornada_id,
      'inventory_frozen', v_frozen
    ),
    v_theoretical_consumption, v_items_snapshot, p_bar_location_id);

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Auto-canje ejecutado',
    'bar_name', v_bar_name, 
    'items', v_items_array, 
    'consumed', v_theoretical_consumption,
    'inventory_frozen', v_frozen
  );
END;
$function$;

-- =============================================
-- ETAPA 2c: Reescribir auto_redeem_sale_token (4 params) sin stock
-- =============================================
CREATE OR REPLACE FUNCTION public.auto_redeem_sale_token(
  p_sale_id uuid,
  p_bar_location_id uuid,
  p_seller_id uuid,
  p_mixer_overrides jsonb DEFAULT NULL::jsonb
)
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
  v_item_addons jsonb;
  v_frozen boolean := false;
  v_resolved_venue_id uuid;
BEGIN
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
  FROM jornadas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;

  IF v_active_jornada_id IS NULL THEN
    v_active_jornada_id := v_token_record.jornada_id;
  END IF;

  v_resolved_venue_id := COALESCE(
    v_token_record.venue_id,
    (SELECT venue_id FROM sales WHERE id = p_sale_id)
  );

  v_frozen := is_inventory_frozen(v_resolved_venue_id);

  -- Calculate theoretical consumption (NO stock check, NO stock deduction)
  FOR v_item IN
    SELECT si.*, c.name AS cocktail_name, c.id AS cocktail_id
    FROM sale_items si
    JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    v_items_array := v_items_array || jsonb_build_object('name', v_item.cocktail_name, 'quantity', v_item.quantity);
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'cocktail_name', v_item.cocktail_name,
      'cocktail_id', v_item.cocktail_id,
      'quantity', v_item.quantity
    );

    FOR v_ingredient IN
      SELECT ci.*, p.name AS product_name, p.unit
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_item.cocktail_id AND ci.product_id IS NOT NULL
    LOOP
      v_theoretical_consumption := v_theoretical_consumption || jsonb_build_object(
        'product_id', v_ingredient.product_id,
        'product_name', v_ingredient.product_name,
        'quantity', v_ingredient.quantity * v_item.quantity,
        'unit', COALESCE(v_ingredient.unit, 'ud')
      );
    END LOOP;
  END LOOP;

  UPDATE pickup_tokens
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_seller_id, bar_location_id = p_bar_location_id
  WHERE id = v_token_record.id;

  INSERT INTO pickup_redemptions_log (bartender_id, pickup_token_id, sale_id, result, pos_id, venue_id, metadata, theoretical_consumption, items_snapshot, bar_location_id)
  VALUES (p_seller_id, v_token_record.id, p_sale_id, 'success'::redemption_result, p_bar_location_id,
    v_resolved_venue_id, jsonb_build_object(
      'auto_redeem', true, 
      'bar_name', v_bar_name, 
      'jornada_id', v_active_jornada_id,
      'inventory_frozen', v_frozen
    ),
    v_theoretical_consumption, v_items_snapshot, p_bar_location_id);

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Auto-canje ejecutado',
    'bar_name', v_bar_name, 
    'items', v_items_array, 
    'consumed', v_theoretical_consumption,
    'inventory_frozen', v_frozen
  );
END;
$function$;

-- =============================================
-- ETAPA 2d: Eliminar legacy redeem_pickup_token(text) de 1 param
-- =============================================
DROP FUNCTION IF EXISTS public.redeem_pickup_token(text);
