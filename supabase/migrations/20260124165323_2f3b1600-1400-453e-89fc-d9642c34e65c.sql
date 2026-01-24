-- ============================================================
-- Migration: Enforce jornada_id NOT NULL for all sales
-- ============================================================

-- Step 1: Delete any orphan sales without jornada_id (should be minimal/none)
-- This ensures migration can proceed
DELETE FROM sale_items WHERE sale_id IN (
  SELECT id FROM sales WHERE jornada_id IS NULL
);
DELETE FROM pickup_tokens WHERE sale_id IN (
  SELECT id FROM sales WHERE jornada_id IS NULL
);
DELETE FROM sales_documents WHERE sale_id IN (
  SELECT id FROM sales WHERE jornada_id IS NULL
);
DELETE FROM gross_income_entries WHERE source_type = 'sale' AND source_id IN (
  SELECT id FROM sales WHERE jornada_id IS NULL
);
DELETE FROM sales WHERE jornada_id IS NULL;

-- Step 2: Make jornada_id NOT NULL
ALTER TABLE public.sales 
  ALTER COLUMN jornada_id SET NOT NULL;

-- Step 3: Add FK constraint if not exists (check first)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'sales_jornada_id_fkey' 
    AND table_name = 'sales'
  ) THEN
    ALTER TABLE public.sales 
      ADD CONSTRAINT sales_jornada_id_fkey 
      FOREIGN KEY (jornada_id) REFERENCES public.jornadas(id);
  END IF;
END $$;

-- Step 4: Remove outside_jornada column (no longer needed - all sales have jornada)
ALTER TABLE public.sales DROP COLUMN IF EXISTS outside_jornada;

-- Step 5: Update create_ticket_sale_with_covers RPC to require jornada
DROP FUNCTION IF EXISTS public.create_ticket_sale_with_covers(jsonb, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_ticket_sale_with_covers(
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_jornada_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_pos_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  i integer;
BEGIN
  v_worker_id := auth.uid();
  
  IF NOT (has_role(v_worker_id, 'ticket_seller') OR has_role(v_worker_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tiene permisos para vender entradas', 'error_code', 'PERMISSION_DENIED');
  END IF;
  
  -- Resolve venue
  IF p_venue_id IS NULL THEN
    SELECT venue_id INTO v_venue_id FROM profiles WHERE id = v_worker_id;
  ELSE
    v_venue_id := p_venue_id;
  END IF;
  
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venue no encontrado', 'error_code', 'VENUE_NOT_FOUND');
  END IF;
  
  -- CRITICAL: Require active jornada
  IF p_jornada_id IS NOT NULL THEN
    -- Verify the provided jornada is active
    SELECT id INTO v_jornada_id FROM jornadas 
    WHERE id = p_jornada_id AND estado = 'activa';
    
    IF v_jornada_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'La jornada proporcionada no está activa', 'error_code', 'JORNADA_NOT_ACTIVE');
    END IF;
  ELSE
    -- Try to find active jornada
    SELECT id INTO v_jornada_id FROM jornadas 
    WHERE estado = 'activa' 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    IF v_jornada_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No hay jornada activa. Pide a un administrador que abra una jornada.', 'error_code', 'NO_ACTIVE_JORNADA');
    END IF;
  END IF;
  
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay items en la venta', 'error_code', 'EMPTY_CART');
  END IF;
  
  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid 
      AND is_active = true
      AND venue_id = v_venue_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de entrada no válido', 'error_code', 'INVALID_TICKET_TYPE');
    END IF;
    
    v_total := v_total + (v_ticket_type.price * (v_item->>'quantity')::integer);
  END LOOP;
  
  -- Generate ticket number
  v_ticket_number := generate_ticket_number();
  
  -- Create ticket sale with required jornada_id
  INSERT INTO ticket_sales (
    venue_id, 
    ticket_number, 
    sold_by_worker_id, 
    jornada_id, 
    pos_id,
    total, 
    payment_method, 
    payment_status
  ) VALUES (
    v_venue_id, 
    v_ticket_number, 
    v_worker_id, 
    v_jornada_id,  -- Now guaranteed to be non-null
    p_pos_id,
    v_total, 
    p_payment_method::payment_method, 
    'paid'
  ) RETURNING id INTO v_ticket_sale_id;
  
  -- Create sale items and cover tokens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ticket_type 
    FROM ticket_types 
    WHERE id = (v_item->>'ticket_type_id')::uuid;
    
    -- Insert ticket sale item
    INSERT INTO ticket_sale_items (
      ticket_sale_id, ticket_type_id, quantity, unit_price, line_total
    ) VALUES (
      v_ticket_sale_id,
      v_ticket_type.id,
      (v_item->>'quantity')::integer,
      v_ticket_type.price,
      v_ticket_type.price * (v_item->>'quantity')::integer
    );
    
    -- Create cover tokens if ticket includes cover
    IF v_ticket_type.includes_cover AND v_ticket_type.cover_cocktail_id IS NOT NULL THEN
      -- Get cocktail info
      SELECT name INTO v_cocktail FROM cocktails WHERE id = v_ticket_type.cover_cocktail_id;
      
      v_cover_count := v_ticket_type.cover_quantity * (v_item->>'quantity')::integer;
      
      FOR i IN 1..v_cover_count LOOP
        INSERT INTO pickup_tokens (
          sale_id,
          source_type,
          ticket_sale_id,
          cover_cocktail_id,
          cover_quantity,
          status,
          expires_at,
          venue_id,
          jornada_id,
          metadata
        ) VALUES (
          NULL,
          'ticket',
          v_ticket_sale_id,
          v_ticket_type.cover_cocktail_id,
          1,
          'issued',
          now() + interval '24 hours',
          v_venue_id,
          v_jornada_id,
          jsonb_build_object(
            'ticket_type', v_ticket_type.name,
            'cocktail_name', v_cocktail.name,
            'ticket_number', v_ticket_number
          )
        ) RETURNING * INTO v_token_record;
        
        v_tokens := v_tokens || jsonb_build_object(
          'token_id', v_token_record.id,
          'token', v_token_record.token,
          'cocktail_id', v_token_record.cover_cocktail_id,
          'ticket_type', v_ticket_type.name
        );
      END LOOP;
    END IF;
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
$$;

-- Step 6: Add comment for documentation
COMMENT ON COLUMN public.sales.jornada_id IS 'Required: Every sale must belong to an active jornada. Enforced NOT NULL.';