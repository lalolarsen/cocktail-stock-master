
-- Fix type mismatch: products.category is enum 'product_category', not text.
-- All comparisons need explicit cast.

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
  v_sale_record RECORD;
BEGIN
  SELECT * INTO v_token_record FROM pickup_tokens WHERE token = p_token LIMIT 1;
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
    FOR v_sale_record IN
      SELECT ci.id, ci.mixer_category, ci.quantity
      FROM cocktail_ingredients ci
      WHERE ci.cocktail_id = v_token_record.cover_cocktail_id AND ci.is_mixer_slot = true
      ORDER BY ci.created_at, ci.id
    LOOP
      DECLARE
        v_options jsonb := '[]'::jsonb;
        v_cat text := COALESCE(v_sale_record.mixer_category, 'latas');
        v_db_category text;
        v_option_record RECORD;
      BEGIN
        IF v_cat = 'redbull' THEN v_db_category := 'redbull'; ELSE v_db_category := 'mixers_tradicionales'; END IF;
        FOR v_option_record IN
          SELECT id, name FROM products
          WHERE category = v_db_category::product_category AND venue_id = v_token_record.venue_id
          ORDER BY name
        LOOP
          v_options := v_options || jsonb_build_object('id', v_option_record.id, 'name', v_option_record.name);
        END LOOP;
        v_mixer_slots := v_mixer_slots || jsonb_build_object(
          'slot_index', v_slot_index, 'label', CASE WHEN v_db_category = 'redbull' THEN 'Red Bull' ELSE 'Mixer' END,
          'mixer_category', v_cat, 'default_product_id', '', 'default_product_name', '',
          'quantity', COALESCE(v_sale_record.quantity, 1), 'available_options', v_options
        );
        v_slot_index := v_slot_index + 1;
      END;
    END LOOP;
    IF jsonb_array_length(v_mixer_slots) > 0 THEN
      RETURN jsonb_build_object('success', true, 'requires_mixer_selection', true, 'mixer_slots', v_mixer_slots);
    END IF;
    RETURN jsonb_build_object('success', true, 'requires_mixer_selection', false);
  END IF;

  -- ══ SALE TOKEN ══
  IF v_token_record.sale_id IS NOT NULL THEN
    FOR v_sale_record IN
      SELECT ci.id, ci.mixer_category, ci.quantity, c.name as cocktail_name
      FROM sale_items si
      JOIN cocktails c ON c.id = si.cocktail_id
      JOIN cocktail_ingredients ci ON ci.cocktail_id = c.id
      WHERE si.sale_id = v_token_record.sale_id AND ci.is_mixer_slot = true
      ORDER BY si.id, ci.created_at, ci.id
    LOOP
      DECLARE
        v_options jsonb := '[]'::jsonb;
        v_cat text := COALESCE(v_sale_record.mixer_category, 'latas');
        v_db_category text;
        v_option_record RECORD;
      BEGIN
        IF v_cat = 'redbull' THEN v_db_category := 'redbull'; ELSE v_db_category := 'mixers_tradicionales'; END IF;
        FOR v_option_record IN
          SELECT id, name FROM products
          WHERE category = v_db_category::product_category AND venue_id = v_token_record.venue_id
          ORDER BY name
        LOOP
          v_options := v_options || jsonb_build_object('id', v_option_record.id, 'name', v_option_record.name);
        END LOOP;
        v_mixer_slots := v_mixer_slots || jsonb_build_object(
          'slot_index', v_slot_index, 'label', v_sale_record.cocktail_name || ' — Mixer',
          'mixer_category', v_cat, 'default_product_id', '', 'default_product_name', '',
          'quantity', COALESCE(v_sale_record.quantity, 1), 'available_options', v_options
        );
        v_slot_index := v_slot_index + 1;
      END;
    END LOOP;
    IF jsonb_array_length(v_mixer_slots) > 0 THEN
      RETURN jsonb_build_object('success', true, 'requires_mixer_selection', true, 'mixer_slots', v_mixer_slots);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'requires_mixer_selection', false);
END;
$$;

-- Fix check_sale_mixer_requirements with cast
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
    FROM sale_items si JOIN cocktails c ON c.id = si.cocktail_id
    WHERE si.sale_id = p_sale_id
  LOOP
    FOR v_ingredient IN
      SELECT ci.* FROM cocktail_ingredients ci
      WHERE ci.cocktail_id = v_item.cocktail_id AND ci.is_mixer_slot = true
      ORDER BY ci.created_at
    LOOP
      IF COALESCE(v_ingredient.mixer_category, 'latas') = 'redbull' THEN
        v_db_category := 'redbull';
      ELSE
        v_db_category := 'mixers_tradicionales';
      END IF;

      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
      INTO v_available_mixers
      FROM products p
      WHERE p.category = v_db_category::product_category AND p.venue_id = v_venue_id;

      v_mixer_slots := v_mixer_slots || jsonb_build_array(jsonb_build_object(
        'slot_index', v_slot_index, 'label', v_item.cocktail_name || ' — Mixer',
        'mixer_category', COALESCE(v_ingredient.mixer_category, 'latas'),
        'default_product_id', '', 'default_product_name', '',
        'quantity', v_ingredient.quantity,
        'available_options', COALESCE(v_available_mixers, '[]'::jsonb)
      ));
      v_slot_index := v_slot_index + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'requires_mixer', jsonb_array_length(v_mixer_slots) > 0, 'mixer_slots', v_mixer_slots);
END;
$$;
