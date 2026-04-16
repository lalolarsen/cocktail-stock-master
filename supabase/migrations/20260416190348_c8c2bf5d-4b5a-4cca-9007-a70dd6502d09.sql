-- 1. Create ticket_type_cover_options table for multi-cover-option support
CREATE TABLE IF NOT EXISTS public.ticket_type_cover_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  cocktail_id uuid NOT NULL REFERENCES public.cocktails(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_type_id, cocktail_id)
);

CREATE INDEX IF NOT EXISTS idx_tt_cover_options_ticket_type ON public.ticket_type_cover_options(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_tt_cover_options_venue ON public.ticket_type_cover_options(venue_id);

ALTER TABLE public.ticket_type_cover_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read cover options" ON public.ticket_type_cover_options
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin gerencia manage cover options" ON public.ticket_type_cover_options
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerencia'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerencia'::app_role));

-- 2. Migrate existing ticket_types.cover_cocktail_id into the new table
INSERT INTO public.ticket_type_cover_options (ticket_type_id, cocktail_id, display_order, venue_id)
SELECT id, cover_cocktail_id, 0, venue_id
FROM public.ticket_types
WHERE includes_cover = true AND cover_cocktail_id IS NOT NULL
ON CONFLICT (ticket_type_id, cocktail_id) DO NOTHING;

-- 3. Updated RPC: accepts cover_selections JSONB and uses unified token structure
CREATE OR REPLACE FUNCTION public.create_ticket_sale_with_covers(
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_jornada_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_pos_id uuid DEFAULT NULL,
  p_cover_selections jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_worker_id uuid;
  v_venue_id uuid;
  v_jornada_id uuid;
  v_ticket_sale_id uuid;
  v_ticket_number text;
  v_total integer := 0;
  v_item jsonb;
  v_ticket_type record;
  v_cocktail record;
  v_tokens jsonb := '[]'::jsonb;
  v_token_record record;
  v_cover_count integer;
  v_selected_cocktail_id uuid;
  v_selections_for_item jsonb;
  v_item_index integer;
  i integer;
BEGIN
  v_worker_id := auth.uid();

  IF NOT (has_role(v_worker_id, 'ticket_seller') OR has_role(v_worker_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tiene permisos para vender entradas', 'error_code', 'PERMISSION_DENIED');
  END IF;

  IF p_venue_id IS NULL THEN
    SELECT venue_id INTO v_venue_id FROM profiles WHERE id = v_worker_id;
  ELSE
    v_venue_id := p_venue_id;
  END IF;

  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venue no encontrado', 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF p_jornada_id IS NOT NULL THEN
    SELECT id INTO v_jornada_id FROM jornadas WHERE id = p_jornada_id AND estado = 'activa';
    IF v_jornada_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'La jornada proporcionada no está activa', 'error_code', 'JORNADA_NOT_ACTIVE');
    END IF;
  ELSE
    SELECT id INTO v_jornada_id FROM jornadas WHERE estado = 'activa' ORDER BY created_at DESC LIMIT 1;
    IF v_jornada_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No hay jornada activa.', 'error_code', 'NO_ACTIVE_JORNADA');
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay items en la venta', 'error_code', 'EMPTY_CART');
  END IF;

  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_ticket_type FROM ticket_types
    WHERE id = (v_item->>'ticket_type_id')::uuid AND is_active = true AND venue_id = v_venue_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de entrada no válido', 'error_code', 'INVALID_TICKET_TYPE');
    END IF;
    v_total := v_total + (v_ticket_type.price * (v_item->>'quantity')::integer);
  END LOOP;

  v_ticket_number := generate_ticket_number();

  INSERT INTO ticket_sales (
    venue_id, ticket_number, sold_by_worker_id, jornada_id, pos_id, total, payment_method, payment_status
  ) VALUES (
    v_venue_id, v_ticket_number, v_worker_id, v_jornada_id, p_pos_id, v_total,
    p_payment_method::payment_method, 'paid'
  ) RETURNING id INTO v_ticket_sale_id;

  v_item_index := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_ticket_type FROM ticket_types WHERE id = (v_item->>'ticket_type_id')::uuid;

    INSERT INTO ticket_sale_items (
      ticket_sale_id, ticket_type_id, quantity, unit_price, line_total, venue_id
    ) VALUES (
      v_ticket_sale_id, v_ticket_type.id, (v_item->>'quantity')::integer,
      v_ticket_type.price, v_ticket_type.price * (v_item->>'quantity')::integer, v_venue_id
    );

    -- Create cover tokens with selected cocktails
    IF v_ticket_type.includes_cover THEN
      v_cover_count := COALESCE(v_ticket_type.cover_quantity, 1) * (v_item->>'quantity')::integer;

      -- Get selections array for this cart line (matched by position)
      SELECT cs INTO v_selections_for_item
      FROM jsonb_array_elements(p_cover_selections) WITH ORDINALITY AS t(cs, ord)
      WHERE ord = v_item_index + 1;

      FOR i IN 1..v_cover_count LOOP
        -- Resolve selected cocktail: prefer client selection, fallback to first option, then legacy
        v_selected_cocktail_id := NULL;
        IF v_selections_for_item IS NOT NULL AND jsonb_typeof(v_selections_for_item) = 'array' THEN
          v_selected_cocktail_id := NULLIF(v_selections_for_item->>(i-1), '')::uuid;
        END IF;

        IF v_selected_cocktail_id IS NULL THEN
          SELECT cocktail_id INTO v_selected_cocktail_id
          FROM ticket_type_cover_options
          WHERE ticket_type_id = v_ticket_type.id
          ORDER BY display_order, created_at LIMIT 1;
        END IF;

        IF v_selected_cocktail_id IS NULL THEN
          v_selected_cocktail_id := v_ticket_type.cover_cocktail_id;
        END IF;

        IF v_selected_cocktail_id IS NULL THEN CONTINUE; END IF;

        SELECT name INTO v_cocktail FROM cocktails WHERE id = v_selected_cocktail_id;

        INSERT INTO pickup_tokens (
          sale_id, source_type, ticket_sale_id, cover_cocktail_id, cover_quantity,
          status, expires_at, venue_id, jornada_id, metadata
        ) VALUES (
          NULL, 'ticket', v_ticket_sale_id, v_selected_cocktail_id, 1, 'issued',
          now() + interval '24 hours', v_venue_id, v_jornada_id,
          jsonb_build_object(
            'kind', 'cover',
            'ticket_type', v_ticket_type.name,
            'cocktail_name', v_cocktail.name,
            'ticket_number', v_ticket_number
          )
        ) RETURNING * INTO v_token_record;

        v_tokens := v_tokens || jsonb_build_object(
          'token_id', v_token_record.id,
          'token', v_token_record.token,
          'short_code', v_token_record.short_code,
          'cocktail_id', v_token_record.cover_cocktail_id,
          'cocktail_name', v_cocktail.name,
          'ticket_type', v_ticket_type.name
        );
      END LOOP;
    END IF;

    v_item_index := v_item_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_sale_id', v_ticket_sale_id,
    'ticket_number', v_ticket_number,
    'total', v_total,
    'jornada_id', v_jornada_id,
    'cover_tokens', v_tokens
  );
END;
$function$;