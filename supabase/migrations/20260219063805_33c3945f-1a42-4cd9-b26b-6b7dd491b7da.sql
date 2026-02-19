
CREATE OR REPLACE FUNCTION public.check_token_mixer_requirements(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record record;
  v_mixer_slots jsonb := '[]'::jsonb;
  v_item record;
  v_ingredient record;
  v_slot_index int := 0;
  v_available_mixers jsonb;
  v_default_product_id uuid;
  v_default_product_name text;
  v_slot_label text;
BEGIN
  -- Find the token
  SELECT pt.*, s.id as parent_sale_id
  INTO v_token_record
  FROM pickup_tokens pt
  LEFT JOIN sales s ON s.id = pt.sale_id
  WHERE pt.token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOKEN_NOT_FOUND');
  END IF;

  -- Check token status
  IF v_token_record.status != 'pending' THEN
    RETURN jsonb_build_object('success', true, 'requires_mixer_selection', false, 'reason', 'already_processed');
  END IF;

  -- ── Internal helper: resolve available products for a mixer_category value ──
  -- mixer_category = 'redbull'  → products named "Red Bull%"  (unidades)
  -- mixer_category = 'latas'    → products in unidades NOT named "Red Bull%"
  -- mixer_category = NULL       → all unidades products (both latas + redbull)
  -- Fallback: exact match on product category column (legacy)

  -- COVER TOKEN
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    v_slot_index := 0;
    FOR v_ingredient IN
      SELECT ci.*
      FROM cocktail_ingredients ci
      WHERE ci.cocktail_id = v_token_record.cover_cocktail_id
        AND ci.is_mixer_slot = true
      ORDER BY ci.created_at
    LOOP
      -- Resolve available options based on mixer_category
      IF v_ingredient.mixer_category = 'redbull' THEN
        v_slot_label := 'Red Bull';
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
        INTO v_available_mixers
        FROM products p
        WHERE p.venue_id = v_token_record.venue_id
          AND p.category = 'unidades'
          AND p.name ILIKE 'Red Bull%';

      ELSIF v_ingredient.mixer_category = 'latas' THEN
        v_slot_label := 'Bebida/Lata';
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
        INTO v_available_mixers
        FROM products p
        WHERE p.venue_id = v_token_record.venue_id
          AND p.category = 'unidades'
          AND p.name NOT ILIKE 'Red Bull%';

      ELSIF v_ingredient.mixer_category IS NULL THEN
        -- No specific category: show all unidades (latas + redbull combined)
        v_slot_label := 'Bebida/Mixer';
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
        INTO v_available_mixers
        FROM products p
        WHERE p.venue_id = v_token_record.venue_id
          AND p.category = 'unidades';

      ELSE
        -- Legacy fallback: try exact category match
        v_slot_label := v_ingredient.mixer_category;
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
        INTO v_available_mixers
        FROM products p
        WHERE p.venue_id = v_token_record.venue_id
          AND p.category = v_ingredient.mixer_category;
      END IF;

      IF v_available_mixers IS NULL OR jsonb_array_length(v_available_mixers) = 0 THEN
        CONTINUE;
      END IF;

      -- Pick default: first option alphabetically
      SELECT (v_available_mixers->0->>'id')::uuid, v_available_mixers->0->>'name'
      INTO v_default_product_id, v_default_product_name;

      -- Override default with product_id if explicitly set
      IF v_ingredient.product_id IS NOT NULL THEN
        SELECT p.name INTO v_default_product_name FROM products p WHERE p.id = v_ingredient.product_id;
        v_default_product_id := v_ingredient.product_id;
      END IF;

      v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
        'slot_index', v_slot_index,
        'label', v_slot_label,
        'default_product_id', v_default_product_id,
        'default_product_name', COALESCE(v_default_product_name, v_slot_label),
        'quantity', v_ingredient.quantity,
        'available_options', v_available_mixers
      ));
      v_slot_index := v_slot_index + 1;
    END LOOP;

  ELSE
    -- REGULAR SALE TOKEN
    FOR v_item IN
      SELECT si.cocktail_id
      FROM sale_items si
      WHERE si.sale_id = v_token_record.sale_id
    LOOP
      FOR v_ingredient IN
        SELECT ci.*
        FROM cocktail_ingredients ci
        WHERE ci.cocktail_id = v_item.cocktail_id
          AND ci.is_mixer_slot = true
        ORDER BY ci.created_at
      LOOP
        IF v_ingredient.mixer_category = 'redbull' THEN
          v_slot_label := 'Red Bull';
          SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
          INTO v_available_mixers
          FROM products p
          WHERE p.venue_id = v_token_record.venue_id
            AND p.category = 'unidades'
            AND p.name ILIKE 'Red Bull%';

        ELSIF v_ingredient.mixer_category = 'latas' THEN
          v_slot_label := 'Bebida/Lata';
          SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
          INTO v_available_mixers
          FROM products p
          WHERE p.venue_id = v_token_record.venue_id
            AND p.category = 'unidades'
            AND p.name NOT ILIKE 'Red Bull%';

        ELSIF v_ingredient.mixer_category IS NULL THEN
          v_slot_label := 'Bebida/Mixer';
          SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
          INTO v_available_mixers
          FROM products p
          WHERE p.venue_id = v_token_record.venue_id
            AND p.category = 'unidades';

        ELSE
          v_slot_label := v_ingredient.mixer_category;
          SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
          INTO v_available_mixers
          FROM products p
          WHERE p.venue_id = v_token_record.venue_id
            AND p.category = v_ingredient.mixer_category;
        END IF;

        IF v_available_mixers IS NULL OR jsonb_array_length(v_available_mixers) = 0 THEN
          CONTINUE;
        END IF;

        SELECT (v_available_mixers->0->>'id')::uuid, v_available_mixers->0->>'name'
        INTO v_default_product_id, v_default_product_name;

        IF v_ingredient.product_id IS NOT NULL THEN
          SELECT p.name INTO v_default_product_name FROM products p WHERE p.id = v_ingredient.product_id;
          v_default_product_id := v_ingredient.product_id;
        END IF;

        v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
          'slot_index', v_slot_index,
          'label', v_slot_label,
          'default_product_id', v_default_product_id,
          'default_product_name', COALESCE(v_default_product_name, v_slot_label),
          'quantity', v_ingredient.quantity,
          'available_options', v_available_mixers
        ));
        v_slot_index := v_slot_index + 1;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'requires_mixer_selection', jsonb_array_length(v_mixer_slots) > 0,
    'mixer_slots', v_mixer_slots
  );
END;
$function$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
