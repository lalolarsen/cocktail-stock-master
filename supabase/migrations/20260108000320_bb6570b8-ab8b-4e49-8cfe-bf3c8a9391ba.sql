-- Create provider_product_mappings table for learning
CREATE TABLE public.provider_product_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  provider_name TEXT NOT NULL,
  raw_product_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  confidence_score NUMERIC DEFAULT 1.0,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, provider_name, raw_product_name)
);

-- Enable RLS
ALTER TABLE public.provider_product_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin can manage provider mappings"
ON public.provider_product_mappings
FOR ALL
USING (true);

-- Index for efficient lookups
CREATE INDEX idx_provider_mappings_lookup 
ON public.provider_product_mappings(venue_id, provider_name, raw_product_name);

CREATE INDEX idx_provider_mappings_confidence 
ON public.provider_product_mappings(confidence_score DESC);

-- Update confirm_purchase_intake to save provider mappings
CREATE OR REPLACE FUNCTION public.confirm_purchase_intake(
  p_purchase_document_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc RECORD;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_raw_name TEXT;
  v_warehouse_id UUID;
  v_movement_count INT := 0;
  v_venue_id UUID;
  v_provider_name TEXT;
BEGIN
  -- Get document details
  SELECT * INTO v_doc FROM purchase_documents WHERE id = p_purchase_document_id;
  
  IF v_doc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;
  
  v_venue_id := v_doc.venue_id;
  v_provider_name := v_doc.provider_name;
  
  -- Get warehouse location
  SELECT id INTO v_warehouse_id 
  FROM stock_locations 
  WHERE type = 'warehouse' AND is_active = true
  LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No warehouse location found');
  END IF;
  
  -- Process each confirmed item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := (v_item->>'unit_cost')::NUMERIC;
    v_raw_name := v_item->>'raw_name';
    
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      -- Update purchase_item as confirmed
      UPDATE purchase_items 
      SET 
        matched_product_id = v_product_id,
        confirmed_quantity = v_quantity,
        confirmed_unit_price = v_unit_cost,
        is_confirmed = true
      WHERE purchase_document_id = p_purchase_document_id 
        AND raw_product_name = v_raw_name;
      
      -- Create stock movement
      INSERT INTO stock_movements (
        product_id,
        quantity,
        movement_type,
        to_location_id,
        unit_cost,
        notes,
        source_type
      ) VALUES (
        v_product_id,
        v_quantity,
        'entrada',
        v_warehouse_id,
        v_unit_cost,
        'Compra: ' || COALESCE(v_doc.document_number, 'Sin número'),
        'purchase'
      );
      
      -- Update product stock and cost
      UPDATE products 
      SET 
        current_stock = current_stock + v_quantity,
        cost_per_unit = CASE 
          WHEN cost_per_unit IS NULL OR cost_per_unit = 0 THEN v_unit_cost
          ELSE (cost_per_unit + v_unit_cost) / 2 -- Simple average
        END,
        updated_at = now()
      WHERE id = v_product_id;
      
      -- Update stock_balances for warehouse
      INSERT INTO stock_balances (location_id, product_id, quantity)
      VALUES (v_warehouse_id, v_product_id, v_quantity)
      ON CONFLICT (location_id, product_id) 
      DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();
      
      -- Save/update provider product mapping (learning)
      IF v_provider_name IS NOT NULL AND v_raw_name IS NOT NULL THEN
        INSERT INTO provider_product_mappings (
          venue_id,
          provider_name,
          raw_product_name,
          product_id,
          confidence_score,
          last_used_at
        ) VALUES (
          v_venue_id,
          LOWER(TRIM(v_provider_name)),
          LOWER(TRIM(v_raw_name)),
          v_product_id,
          1.0,
          now()
        )
        ON CONFLICT (venue_id, provider_name, raw_product_name)
        DO UPDATE SET
          product_id = EXCLUDED.product_id,
          confidence_score = LEAST(provider_product_mappings.confidence_score + 0.1, 2.0),
          last_used_at = now();
      END IF;
      
      -- Also update generic product_name_mappings
      INSERT INTO product_name_mappings (
        venue_id,
        raw_name,
        normalized_name,
        product_id,
        usage_count
      ) VALUES (
        v_venue_id,
        LOWER(TRIM(v_raw_name)),
        LOWER(TRIM(v_raw_name)),
        v_product_id,
        1
      )
      ON CONFLICT (venue_id, raw_name) 
      DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        usage_count = COALESCE(product_name_mappings.usage_count, 0) + 1,
        updated_at = now();
      
      v_movement_count := v_movement_count + 1;
    END IF;
  END LOOP;
  
  -- Mark document as confirmed
  UPDATE purchase_documents 
  SET 
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_purchase_document_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'movements_created', v_movement_count
  );
END;
$$;