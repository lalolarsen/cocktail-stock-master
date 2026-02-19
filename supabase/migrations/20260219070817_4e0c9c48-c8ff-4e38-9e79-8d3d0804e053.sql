
-- Update check_token_mixer_requirements to use canonical MIXER_TRADICIONAL / REDBULL subcategories
CREATE OR REPLACE FUNCTION public.check_token_mixer_requirements(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record RECORD;
  v_sale_record RECORD;
  v_mixer_slots jsonb := '[]'::jsonb;
  v_slot_index int := 0;
  v_cocktail_id uuid;
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

  -- If cover cocktail is set, check that for mixer slots
  IF v_token_record.cover_cocktail_id IS NOT NULL THEN
    v_cocktail_id := v_token_record.cover_cocktail_id;

    FOR v_sale_record IN
      SELECT
        ci.id,
        ci.mixer_category,
        ci.quantity,
        ci.slot_index,
        p.subcategory as product_subcategory
      FROM cocktail_ingredients ci
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.cocktail_id = v_cocktail_id
        AND ci.is_mixer_slot = true
      ORDER BY ci.slot_index NULLS LAST, ci.id
    LOOP
      DECLARE
        v_options jsonb := '[]'::jsonb;
        v_cat text := COALESCE(v_sale_record.mixer_category, 'latas');
        v_db_subcategory text;
        v_option_record RECORD;
      BEGIN
        -- Map mixer_category to canonical DB subcategory
        IF v_cat = 'redbull' THEN
          v_db_subcategory := 'REDBULL';
        ELSE
          v_db_subcategory := 'MIXER_TRADICIONAL';
        END IF;

        -- Fetch available options from products table using is_mixer + canonical subcategory
        FOR v_option_record IN
          SELECT id, name, subcategory
          FROM products
          WHERE is_mixer = true
            AND is_active_in_sales = true
            AND subcategory = v_db_subcategory
            AND venue_id = v_token_record.venue_id
          ORDER BY name
        LOOP
          v_options := v_options || jsonb_build_object(
            'id', v_option_record.id,
            'name', v_option_record.name,
            'subcategory', v_option_record.subcategory
          );
        END LOOP;

        v_mixer_slots := v_mixer_slots || jsonb_build_object(
          'slot_index', COALESCE(v_sale_record.slot_index, v_slot_index),
          'label', 'Mixer ' || (v_slot_index + 1)::text,
          'mixer_category', v_cat,
          'default_product_id', '',
          'default_product_name', '',
          'quantity', COALESCE(v_sale_record.quantity, 220),
          'available_options', v_options
        );

        v_slot_index := v_slot_index + 1;
      END;
    END LOOP;

    IF jsonb_array_length(v_mixer_slots) > 0 THEN
      RETURN jsonb_build_object(
        'requires_mixer_selection', true,
        'mixer_slots', v_mixer_slots,
        'cocktail_id', v_cocktail_id
      );
    END IF;
  END IF;

  -- No mixer slots needed
  RETURN jsonb_build_object('requires_mixer_selection', false);
END;
$$;
