-- ============================================
-- INVOICE READER V2: Schema Expansion + CPP Logic
-- ============================================

-- 1. Expand purchase_documents with tax fields and audit trail
ALTER TABLE purchase_documents 
ADD COLUMN IF NOT EXISTS net_amount NUMERIC,
ADD COLUMN IF NOT EXISTS iva_amount NUMERIC,
ADD COLUMN IF NOT EXISTS total_amount_gross NUMERIC,
ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN purchase_documents.net_amount IS 'Monto neto extraído del documento';
COMMENT ON COLUMN purchase_documents.iva_amount IS 'IVA extraído del documento';
COMMENT ON COLUMN purchase_documents.total_amount_gross IS 'Total bruto extraído del documento';
COMMENT ON COLUMN purchase_documents.audit_trail IS 'Bitácora de cambios en JSON Array';

-- 2. Expand purchase_items with UoM, status, and classification fields
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id),
ADD COLUMN IF NOT EXISTS extracted_uom TEXT DEFAULT 'Unidad',
ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS normalized_quantity NUMERIC,
ADD COLUMN IF NOT EXISTS normalized_unit_cost NUMERIC,
ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'inventory',
ADD COLUMN IF NOT EXISTS item_status TEXT DEFAULT 'pending_match',
ADD COLUMN IF NOT EXISTS expense_category TEXT;

-- Add comments
COMMENT ON COLUMN purchase_items.extracted_uom IS 'Unidad de medida extraída (Unidad, Caja, Pack, etc.)';
COMMENT ON COLUMN purchase_items.conversion_factor IS 'Factor de conversión a unidad base';
COMMENT ON COLUMN purchase_items.normalized_quantity IS 'Cantidad normalizada (qty * conversion_factor)';
COMMENT ON COLUMN purchase_items.normalized_unit_cost IS 'Costo unitario normalizado (unit_price / conversion_factor)';
COMMENT ON COLUMN purchase_items.classification IS 'Clasificación: inventory | expense';
COMMENT ON COLUMN purchase_items.item_status IS 'Estado: pending_match | matched | marked_as_expense | ready | applied';
COMMENT ON COLUMN purchase_items.expense_category IS 'Categoría de gasto si classification = expense';

-- 3. Create purchase_import_audit table for full traceability
CREATE TABLE IF NOT EXISTS purchase_import_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_document_id UUID NOT NULL REFERENCES purchase_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  user_id UUID,
  previous_state JSONB,
  new_state JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_purchase_import_audit_document 
ON purchase_import_audit(purchase_document_id);

CREATE INDEX IF NOT EXISTS idx_purchase_import_audit_created 
ON purchase_import_audit(created_at DESC);

-- Enable RLS
ALTER TABLE purchase_import_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view audit logs for their venue's documents
CREATE POLICY "Users can view audit for their venue docs"
ON purchase_import_audit FOR SELECT
USING (EXISTS (
  SELECT 1 FROM purchase_documents pd 
  WHERE pd.id = purchase_document_id 
  AND pd.venue_id = get_user_venue_id()
));

-- RLS Policy: Admins can insert audit logs
CREATE POLICY "Admins can insert audit logs"
ON purchase_import_audit FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'gerencia'::app_role)
);

-- 4. Create or replace function to log audit events
CREATE OR REPLACE FUNCTION log_purchase_audit(
  p_document_id UUID,
  p_action TEXT,
  p_previous_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO purchase_import_audit (
    purchase_document_id,
    action,
    user_id,
    previous_state,
    new_state
  ) VALUES (
    p_document_id,
    p_action,
    auth.uid(),
    p_previous_state,
    p_new_state
  )
  RETURNING id INTO v_audit_id;
  
  -- Also append to document's audit_trail
  UPDATE purchase_documents
  SET audit_trail = COALESCE(audit_trail, '[]'::jsonb) || jsonb_build_object(
    'action', p_action,
    'user_id', auth.uid(),
    'timestamp', now(),
    'changes', p_new_state
  )
  WHERE id = p_document_id;
  
  RETURN v_audit_id;
END;
$$;

-- 5. Create or replace confirm_purchase_intake with CPP (Costo Promedio Ponderado) logic
CREATE OR REPLACE FUNCTION confirm_purchase_intake(
  p_purchase_document_id UUID,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_raw_name TEXT;
  v_item_id UUID;
  v_conversion_factor NUMERIC;
  v_normalized_qty NUMERIC;
  v_normalized_cost NUMERIC;
  v_current_stock NUMERIC;
  v_current_cpp NUMERIC;
  v_new_cpp NUMERIC;
  v_warehouse_id UUID;
  v_venue_id UUID;
  v_total_items INT := 0;
  v_total_quantity NUMERIC := 0;
  v_total_amount NUMERIC := 0;
  v_user_id UUID;
  v_provider_name TEXT;
BEGIN
  -- Get user and venue context
  v_user_id := auth.uid();
  
  -- Get document info
  SELECT venue_id, provider_name INTO v_venue_id, v_provider_name
  FROM purchase_documents
  WHERE id = p_purchase_document_id;
  
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Documento no encontrado');
  END IF;
  
  -- Get warehouse
  SELECT id INTO v_warehouse_id
  FROM stock_locations
  WHERE venue_id = v_venue_id AND type = 'warehouse' AND is_active = true
  LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay bodega activa');
  END IF;
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    v_raw_name := v_item->>'raw_name';
    v_conversion_factor := COALESCE((v_item->>'conversion_factor')::NUMERIC, 1.0);
    
    -- Skip if no product or quantity
    IF v_product_id IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Calculate normalized values
    v_normalized_qty := v_quantity * v_conversion_factor;
    v_normalized_cost := CASE 
      WHEN v_conversion_factor > 0 THEN v_unit_cost / v_conversion_factor 
      ELSE v_unit_cost 
    END;
    
    -- Get current product stock and CPP
    SELECT current_stock, cost_per_unit 
    INTO v_current_stock, v_current_cpp
    FROM products
    WHERE id = v_product_id;
    
    -- Calculate new CPP using weighted average formula
    -- CPP = (Stock_actual * CPP_actual + Cantidad_nueva * Costo_nuevo) / (Stock_actual + Cantidad_nueva)
    IF v_current_stock IS NULL OR v_current_stock <= 0 OR v_current_cpp IS NULL OR v_current_cpp <= 0 THEN
      -- No existing stock or cost: use the new cost directly
      v_new_cpp := v_normalized_cost;
    ELSE
      -- Apply weighted average
      v_new_cpp := ROUND(
        ((v_current_stock * v_current_cpp) + (v_normalized_qty * v_normalized_cost)) 
        / (v_current_stock + v_normalized_qty),
        2
      );
    END IF;
    
    -- Update product stock and CPP
    UPDATE products 
    SET 
      current_stock = COALESCE(current_stock, 0) + v_normalized_qty,
      cost_per_unit = v_new_cpp,
      updated_at = now()
    WHERE id = v_product_id;
    
    -- Create stock lot in warehouse
    INSERT INTO stock_lots (
      venue_id,
      product_id,
      location_id,
      quantity,
      source,
      expires_at
    ) VALUES (
      v_venue_id,
      v_product_id,
      v_warehouse_id,
      v_normalized_qty,
      'purchase_import',
      CURRENT_DATE + INTERVAL '1 year'
    );
    
    -- Update location stock
    INSERT INTO location_stock (venue_id, location_id, product_id, quantity)
    VALUES (v_venue_id, v_warehouse_id, v_product_id, v_normalized_qty)
    ON CONFLICT (location_id, product_id)
    DO UPDATE SET 
      quantity = location_stock.quantity + EXCLUDED.quantity,
      updated_at = now();
    
    -- Update purchase item as confirmed
    UPDATE purchase_items
    SET 
      confirmed_quantity = v_normalized_qty,
      confirmed_unit_price = v_normalized_cost,
      normalized_quantity = v_normalized_qty,
      normalized_unit_cost = v_normalized_cost,
      is_confirmed = true,
      item_status = 'applied'
    WHERE id = v_item_id;
    
    -- Learn the mapping for future use (provider-specific)
    IF v_raw_name IS NOT NULL AND v_provider_name IS NOT NULL THEN
      INSERT INTO provider_product_mappings (
        provider_name,
        raw_product_name,
        product_id,
        venue_id,
        confidence_score
      ) VALUES (
        lower(trim(v_provider_name)),
        lower(trim(v_raw_name)),
        v_product_id,
        v_venue_id,
        1.0
      )
      ON CONFLICT (provider_name, raw_product_name)
      DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        confidence_score = LEAST(provider_product_mappings.confidence_score + 0.1, 1.0),
        updated_at = now();
    END IF;
    
    -- Also update generic mappings
    IF v_raw_name IS NOT NULL THEN
      INSERT INTO product_name_mappings (
        raw_name,
        normalized_name,
        product_id,
        venue_id,
        usage_count
      ) VALUES (
        lower(trim(v_raw_name)),
        lower(trim(v_raw_name)),
        v_product_id,
        v_venue_id,
        1
      )
      ON CONFLICT (raw_name, venue_id)
      DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        usage_count = COALESCE(product_name_mappings.usage_count, 0) + 1,
        updated_at = now();
    END IF;
    
    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_normalized_qty;
    v_total_amount := v_total_amount + (v_normalized_qty * v_normalized_cost);
  END LOOP;
  
  -- Update document status
  UPDATE purchase_documents
  SET 
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = v_user_id
  WHERE id = p_purchase_document_id;
  
  -- Log audit event
  PERFORM log_purchase_audit(
    p_purchase_document_id,
    'document_confirmed',
    NULL,
    jsonb_build_object(
      'total_items', v_total_items,
      'total_quantity', v_total_quantity,
      'total_amount', v_total_amount,
      'confirmed_by', v_user_id
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'total_items', v_total_items,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
END;
$$;

-- 6. Create helper function to update item status
CREATE OR REPLACE FUNCTION update_purchase_item_status(
  p_item_id UUID,
  p_status TEXT,
  p_product_id UUID DEFAULT NULL,
  p_classification TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE purchase_items
  SET 
    item_status = p_status,
    matched_product_id = COALESCE(p_product_id, matched_product_id),
    classification = COALESCE(p_classification, classification)
  WHERE id = p_item_id;
END;
$$;

-- 7. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_items_status 
ON purchase_items(item_status);

CREATE INDEX IF NOT EXISTS idx_purchase_items_classification 
ON purchase_items(classification);

CREATE INDEX IF NOT EXISTS idx_purchase_documents_status 
ON purchase_documents(status);

-- 8. Backfill venue_id on purchase_items from their parent documents
UPDATE purchase_items pi
SET venue_id = pd.venue_id
FROM purchase_documents pd
WHERE pi.purchase_document_id = pd.id
AND pi.venue_id IS NULL;