
-- Enums
CREATE TYPE public.ext_consumption_source AS ENUM ('cover_manual', 'totem_manual');
CREATE TYPE public.ext_consumption_status AS ENUM ('draft', 'confirmed', 'applied', 'cancelled');

-- Batches
CREATE TABLE public.external_consumption_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  source_type public.ext_consumption_source NOT NULL,
  status public.ext_consumption_status NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  applied_at timestamptz,
  applied_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lines
CREATE TABLE public.external_consumption_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.external_consumption_batches(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  cocktail_id uuid REFERENCES public.cocktails(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  recipe_snapshot jsonb,
  cost_snapshot numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.external_consumption_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_consumption_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view batches in their venue"
  ON public.external_consumption_batches FOR SELECT TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert batches in their venue"
  ON public.external_consumption_batches FOR INSERT TO authenticated
  WITH CHECK (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update batches in their venue"
  ON public.external_consumption_batches FOR UPDATE TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view lines via batch"
  ON public.external_consumption_lines FOR SELECT TO authenticated
  USING (batch_id IN (SELECT id FROM public.external_consumption_batches WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can insert lines via batch"
  ON public.external_consumption_lines FOR INSERT TO authenticated
  WITH CHECK (batch_id IN (SELECT id FROM public.external_consumption_batches WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can update lines via batch"
  ON public.external_consumption_lines FOR UPDATE TO authenticated
  USING (batch_id IN (SELECT id FROM public.external_consumption_batches WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can delete lines via batch"
  ON public.external_consumption_lines FOR DELETE TO authenticated
  USING (batch_id IN (SELECT id FROM public.external_consumption_batches WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

-- RPC to apply batch
CREATE OR REPLACE FUNCTION public.apply_external_consumption_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_line record;
  v_ingredient record;
  v_movement_reason text;
  v_total_movements int := 0;
  v_recipe jsonb;
BEGIN
  -- Get and validate batch
  SELECT * INTO v_batch FROM external_consumption_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status != 'confirmed' THEN RAISE EXCEPTION 'Batch must be confirmed before applying'; END IF;
  IF v_batch.reviewed_by IS NULL THEN RAISE EXCEPTION 'Batch must be reviewed before applying'; END IF;

  -- Determine movement reason
  v_movement_reason := CASE v_batch.source_type
    WHEN 'cover_manual' THEN 'external_consumption_cover'
    WHEN 'totem_manual' THEN 'external_consumption_totem'
  END;

  -- Process each line
  FOR v_line IN SELECT * FROM external_consumption_lines WHERE batch_id = p_batch_id
  LOOP
    IF v_line.cocktail_id IS NOT NULL THEN
      -- It's a cocktail: resolve recipe and deduct each ingredient
      v_recipe := '[]'::jsonb;
      FOR v_ingredient IN
        SELECT ci.product_id, ci.quantity as qty_per_serving, p.name as product_name
        FROM cocktail_ingredients ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.cocktail_id = v_line.cocktail_id
          AND ci.product_id IS NOT NULL
      LOOP
        -- Create stock_movement for each ingredient
        INSERT INTO stock_movements (
          product_id, location_id, venue_id, movement_type, quantity, reason, notes
        ) VALUES (
          v_ingredient.product_id,
          v_batch.location_id,
          v_batch.venue_id,
          'salida',
          (v_ingredient.qty_per_serving * v_line.quantity),
          v_movement_reason,
          format('Consumo externo batch %s: %s x %s', p_batch_id, v_line.quantity, v_ingredient.product_name)
        );

        -- Update stock_balances
        UPDATE stock_balances
        SET quantity = GREATEST(quantity - (v_ingredient.qty_per_serving * v_line.quantity), 0),
            updated_at = now()
        WHERE product_id = v_ingredient.product_id
          AND location_id = v_batch.location_id;

        v_recipe := v_recipe || jsonb_build_object(
          'product_id', v_ingredient.product_id,
          'product_name', v_ingredient.product_name,
          'qty_per_serving', v_ingredient.qty_per_serving,
          'total_deducted', v_ingredient.qty_per_serving * v_line.quantity
        );
        v_total_movements := v_total_movements + 1;
      END LOOP;

      -- Save recipe snapshot
      UPDATE external_consumption_lines SET recipe_snapshot = v_recipe WHERE id = v_line.id;

    ELSIF v_line.product_id IS NOT NULL THEN
      -- Direct product deduction
      INSERT INTO stock_movements (
        product_id, location_id, venue_id, movement_type, quantity, reason, notes
      ) VALUES (
        v_line.product_id,
        v_batch.location_id,
        v_batch.venue_id,
        'salida',
        v_line.quantity,
        v_movement_reason,
        format('Consumo externo batch %s: %s unidades', p_batch_id, v_line.quantity)
      );

      UPDATE stock_balances
      SET quantity = GREATEST(quantity - v_line.quantity, 0),
          updated_at = now()
      WHERE product_id = v_line.product_id
        AND location_id = v_batch.location_id;

      v_total_movements := v_total_movements + 1;
    END IF;
  END LOOP;

  -- Mark batch as applied
  UPDATE external_consumption_batches
  SET status = 'applied', applied_at = now(), applied_by = auth.uid(), updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'movements_created', v_total_movements);
END;
$$;
