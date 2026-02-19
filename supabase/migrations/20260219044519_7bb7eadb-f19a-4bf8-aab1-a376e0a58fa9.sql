CREATE OR REPLACE FUNCTION public.check_token_mixer_requirements(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record record;
  v_mixer_slots jsonb := '[]'::jsonb;
  v_cocktail_id uuid;
  v_item record;
  v_ingredient record;
  v_slot_index int := 0;
  v_available_mixers jsonb;
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

  -- COVER TOKEN
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    v_slot_index := 0;
    FOR v_ingredient IN
      SELECT ci.*, p.name as product_name, p.category as product_category
      FROM cocktail_ingredients ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_token_record.cover_cocktail_id
        AND ci.is_mixer_slot = true
      ORDER BY ci.created_at
    LOOP
      -- Get available mixers (same category products)
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
      INTO v_available_mixers
      FROM products p
      WHERE p.category = v_ingredient.product_category
        AND p.venue_id = v_token_record.venue_id;

      v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
        'slot_index', v_slot_index,
        'label', 'Bebida/Mixer',
        'default_product_id', v_ingredient.product_id,
        'default_product_name', v_ingredient.product_name,
        'quantity', v_ingredient.quantity,
        'available_options', COALESCE(v_available_mixers, '[]'::jsonb)
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
        SELECT ci.*, p.name as product_name, p.category as product_category
        FROM cocktail_ingredients ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.cocktail_id = v_item.cocktail_id
          AND ci.is_mixer_slot = true
        ORDER BY ci.created_at
      LOOP
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
        INTO v_available_mixers
        FROM products p
        WHERE p.category = v_ingredient.product_category
          AND p.venue_id = v_token_record.venue_id;

        v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
          'slot_index', v_slot_index,
          'label', 'Bebida/Mixer',
          'default_product_id', v_ingredient.product_id,
          'default_product_name', v_ingredient.product_name,
          'quantity', v_ingredient.quantity,
          'available_options', COALESCE(v_available_mixers, '[]'::jsonb)
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