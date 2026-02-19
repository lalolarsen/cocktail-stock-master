
-- Fix check_token_mixer_requirements to handle NULL mixer_category
-- For slots with no mixer_category, default to 'unidades' (individual drinks/mixers)
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
  v_mixer_category text;
  v_resolved_category text;
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

  -- Helper: resolve mixer slots for a given cocktail_id
  -- (used for both cover tokens and regular sale tokens)

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
      v_mixer_category := v_ingredient.mixer_category;

      IF v_ingredient.product_id IS NOT NULL THEN
        -- Has a concrete product: get its category
        SELECT p.name, p.category
        INTO v_default_product_name, v_mixer_category
        FROM products p
        WHERE p.id = v_ingredient.product_id;
        v_default_product_id := v_ingredient.product_id;
        v_resolved_category := v_mixer_category;
      ELSE
        -- NULL product_id: use mixer_category if set, otherwise fallback to 'unidades'
        v_resolved_category := COALESCE(v_mixer_category, 'unidades');
        v_default_product_id := NULL;
        v_default_product_name := NULL;
        -- Pick first product in category as default
        SELECT p.id, p.name INTO v_default_product_id, v_default_product_name
        FROM products p
        WHERE p.category = v_resolved_category
          AND p.venue_id = v_token_record.venue_id
        ORDER BY p.name
        LIMIT 1;
      END IF;

      -- Get all available options in that category
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
      INTO v_available_mixers
      FROM products p
      WHERE p.category = v_resolved_category
        AND p.venue_id = v_token_record.venue_id;

      IF v_available_mixers IS NULL OR jsonb_array_length(v_available_mixers) = 0 THEN
        CONTINUE; -- skip if no options available
      END IF;

      v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
        'slot_index', v_slot_index,
        'label', COALESCE(v_resolved_category, 'Bebida'),
        'default_product_id', v_default_product_id,
        'default_product_name', COALESCE(v_default_product_name, 'Bebida'),
        'quantity', v_ingredient.quantity,
        'available_options', v_available_mixers
      ));
      v_slot_index := v_slot_index + 1;
    END LOOP;

  ELSE
    -- REGULAR SALE TOKEN - check all sale items
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
        v_mixer_category := v_ingredient.mixer_category;

        IF v_ingredient.product_id IS NOT NULL THEN
          SELECT p.name, p.category
          INTO v_default_product_name, v_mixer_category
          FROM products p
          WHERE p.id = v_ingredient.product_id;
          v_default_product_id := v_ingredient.product_id;
          v_resolved_category := v_mixer_category;
        ELSE
          v_resolved_category := COALESCE(v_mixer_category, 'unidades');
          v_default_product_id := NULL;
          v_default_product_name := NULL;
          SELECT p.id, p.name INTO v_default_product_id, v_default_product_name
          FROM products p
          WHERE p.category = v_resolved_category
            AND p.venue_id = v_token_record.venue_id
          ORDER BY p.name
          LIMIT 1;
        END IF;

        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
        INTO v_available_mixers
        FROM products p
        WHERE p.category = v_resolved_category
          AND p.venue_id = v_token_record.venue_id;

        IF v_available_mixers IS NULL OR jsonb_array_length(v_available_mixers) = 0 THEN
          CONTINUE;
        END IF;

        v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
          'slot_index', v_slot_index,
          'label', COALESCE(v_resolved_category, 'Bebida'),
          'default_product_id', v_default_product_id,
          'default_product_name', COALESCE(v_default_product_name, 'Bebida'),
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

-- Reload PostgREST schema cache so the API picks up the updated function
NOTIFY pgrst, 'reload schema';
