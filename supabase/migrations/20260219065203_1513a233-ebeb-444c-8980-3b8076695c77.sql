
-- Reemplazar check_token_mixer_requirements usando subcategory real de la BD
-- Categorías: mixers_tradicionales -> 'latas', mixers_redbull -> 'redbull'
CREATE OR REPLACE FUNCTION public.check_token_mixer_requirements(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_record RECORD;
  v_cocktail_id UUID;
  v_mixer_slots JSONB := '[]'::JSONB;
  v_slot_index INT := 0;
  v_ingredient RECORD;
  v_default_product_id UUID;
  v_default_product_name TEXT;
  v_available_options JSONB;
  v_mixer_category TEXT;
  v_db_subcategory TEXT;
BEGIN
  -- Fetch token info
  SELECT pt.id, pt.status, pt.venue_id, pt.sale_id, pt.cover_cocktail_id, pt.source_type
  INTO v_token_record
  FROM public.pickup_tokens pt
  WHERE pt.token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('requires_mixer_selection', false, 'mixer_slots', '[]'::JSONB);
  END IF;

  IF v_token_record.status != 'open' THEN
    RETURN jsonb_build_object('requires_mixer_selection', false, 'mixer_slots', '[]'::JSONB);
  END IF;

  -- Determine cocktail_id from source
  IF v_token_record.source_type = 'ticket' AND v_token_record.cover_cocktail_id IS NOT NULL THEN
    v_cocktail_id := v_token_record.cover_cocktail_id;
  ELSIF v_token_record.sale_id IS NOT NULL THEN
    SELECT si.cocktail_id INTO v_cocktail_id
    FROM public.sale_items si
    WHERE si.sale_id = v_token_record.sale_id
    LIMIT 1;
  END IF;

  IF v_cocktail_id IS NULL THEN
    RETURN jsonb_build_object('requires_mixer_selection', false, 'mixer_slots', '[]'::JSONB);
  END IF;

  -- Iterate over mixer slots of the cocktail
  FOR v_ingredient IN
    SELECT ci.id, ci.is_mixer_slot, ci.mixer_category, ci.product_id, ci.quantity
    FROM public.cocktail_ingredients ci
    WHERE ci.cocktail_id = v_cocktail_id
      AND ci.is_mixer_slot = TRUE
    ORDER BY ci.id
  LOOP
    -- Determine which subcategory to query based on mixer_category
    -- mixer_category 'redbull' or 'latas' -> map to DB subcategory
    IF v_ingredient.mixer_category = 'redbull' THEN
      v_db_subcategory := 'mixers_redbull';
      v_mixer_category := 'redbull';
    ELSIF v_ingredient.mixer_category = 'latas' THEN
      v_db_subcategory := 'mixers_tradicionales';
      v_mixer_category := 'latas';
    ELSE
      -- Fallback: show both traditional mixers
      v_db_subcategory := 'mixers_tradicionales';
      v_mixer_category := 'latas';
    END IF;

    -- If ingredient has a fixed product_id, use its subcategory directly
    IF v_ingredient.product_id IS NOT NULL THEN
      -- Get the category of that specific product
      SELECT p.subcategory INTO v_db_subcategory
      FROM public.products p
      WHERE p.id = v_ingredient.product_id;

      IF v_db_subcategory = 'mixers_redbull' THEN
        v_mixer_category := 'redbull';
      ELSE
        v_mixer_category := 'latas';
      END IF;

      -- Get all options from that subcategory for this venue
      SELECT jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'subcategory', p.subcategory)
        ORDER BY p.name
      ) INTO v_available_options
      FROM public.products p
      WHERE p.category = 'unidades'
        AND p.subcategory = v_db_subcategory
        AND p.venue_id = v_token_record.venue_id;

      SELECT p.id, p.name INTO v_default_product_id, v_default_product_name
      FROM public.products p
      WHERE p.id = v_ingredient.product_id;

    ELSE
      -- Variable mixer slot: query by subcategory
      SELECT jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'subcategory', p.subcategory)
        ORDER BY p.name
      ) INTO v_available_options
      FROM public.products p
      WHERE p.category = 'unidades'
        AND p.subcategory = v_db_subcategory
        AND p.venue_id = v_token_record.venue_id;

      -- Default: first product in category
      SELECT p.id, p.name INTO v_default_product_id, v_default_product_name
      FROM public.products p
      WHERE p.category = 'unidades'
        AND p.subcategory = v_db_subcategory
        AND p.venue_id = v_token_record.venue_id
      ORDER BY p.name
      LIMIT 1;
    END IF;

    -- Build slot
    v_mixer_slots := v_mixer_slots || jsonb_build_array(
      jsonb_build_object(
        'slot_index', v_slot_index,
        'label', CASE
          WHEN v_mixer_category = 'redbull' THEN 'Red Bull'
          ELSE 'Bebida en lata'
        END,
        'mixer_category', v_mixer_category,
        'default_product_id', COALESCE(v_default_product_id::TEXT, ''),
        'default_product_name', COALESCE(v_default_product_name, ''),
        'quantity', v_ingredient.quantity,
        'available_options', COALESCE(v_available_options, '[]'::JSONB)
      )
    );

    v_slot_index := v_slot_index + 1;
  END LOOP;

  IF jsonb_array_length(v_mixer_slots) = 0 THEN
    RETURN jsonb_build_object('requires_mixer_selection', false, 'mixer_slots', '[]'::JSONB);
  END IF;

  RETURN jsonb_build_object(
    'requires_mixer_selection', true,
    'mixer_slots', v_mixer_slots,
    'cocktail_id', v_cocktail_id::TEXT
  );
END;
$$;
