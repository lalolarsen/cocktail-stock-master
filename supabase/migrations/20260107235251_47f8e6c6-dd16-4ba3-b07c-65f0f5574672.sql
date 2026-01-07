-- Create storage bucket for invoice files
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-documents', 'purchase-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for purchase documents (admin only)
CREATE POLICY "Admin can upload purchase documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'purchase-documents' 
  AND EXISTS (
    SELECT 1 FROM worker_roles 
    WHERE worker_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admin can view purchase documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'purchase-documents' 
  AND EXISTS (
    SELECT 1 FROM worker_roles 
    WHERE worker_id = auth.uid() AND role = 'admin'
  )
);

-- Purchase documents table
CREATE TABLE public.purchase_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  provider_name TEXT,
  provider_rut TEXT,
  document_number TEXT,
  document_date DATE,
  total_amount NUMERIC DEFAULT 0,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  raw_text TEXT,
  extracted_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'confirmed', 'error')),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies (admin only)
CREATE POLICY "Admin can view purchase documents" ON public.purchase_documents
FOR SELECT USING (
  EXISTS (SELECT 1 FROM worker_roles WHERE worker_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin can create purchase documents" ON public.purchase_documents
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM worker_roles WHERE worker_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin can update purchase documents" ON public.purchase_documents
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM worker_roles WHERE worker_id = auth.uid() AND role = 'admin')
);

-- Purchase items table
CREATE TABLE public.purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_document_id UUID NOT NULL REFERENCES public.purchase_documents(id) ON DELETE CASCADE,
  raw_product_name TEXT NOT NULL,
  extracted_quantity NUMERIC,
  extracted_unit_price NUMERIC,
  extracted_total NUMERIC,
  matched_product_id UUID REFERENCES public.products(id),
  confirmed_quantity NUMERIC,
  confirmed_unit_price NUMERIC,
  match_confidence NUMERIC DEFAULT 0,
  is_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin can manage purchase items" ON public.purchase_items
FOR ALL USING (
  EXISTS (SELECT 1 FROM worker_roles WHERE worker_id = auth.uid() AND role = 'admin')
);

-- Product name mappings for learning
CREATE TABLE public.product_name_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  usage_count INTEGER DEFAULT 1,
  venue_id UUID REFERENCES public.venues(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(raw_name, venue_id)
);

-- Enable RLS
ALTER TABLE public.product_name_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage product mappings" ON public.product_name_mappings
FOR ALL USING (
  EXISTS (SELECT 1 FROM worker_roles WHERE worker_id = auth.uid() AND role = 'admin')
);

-- Function to confirm purchase and create stock movements
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
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_warehouse_id UUID;
  v_venue_id UUID;
  v_total_items INT := 0;
  v_total_quantity NUMERIC := 0;
  v_total_amount NUMERIC := 0;
BEGIN
  -- Get venue_id from purchase document
  SELECT venue_id INTO v_venue_id
  FROM purchase_documents
  WHERE id = p_purchase_document_id;

  -- Get warehouse location
  SELECT id INTO v_warehouse_id
  FROM stock_locations
  WHERE type = 'warehouse' AND is_active = true
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró ubicación de bodega');
  END IF;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_product_id IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    -- Update purchase item
    UPDATE purchase_items
    SET 
      matched_product_id = v_product_id,
      confirmed_quantity = v_quantity,
      confirmed_unit_price = v_unit_price,
      is_confirmed = true
    WHERE id = (v_item->>'item_id')::UUID;

    -- Create stock movement (entrada)
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
      v_unit_price,
      'Ingreso por compra - Doc: ' || p_purchase_document_id,
      'purchase'
    );

    -- Update product current_stock
    UPDATE products
    SET 
      current_stock = current_stock + v_quantity,
      cost_per_unit = v_unit_price,
      updated_at = now()
    WHERE id = v_product_id;

    -- Update stock balance
    INSERT INTO stock_balances (location_id, product_id, quantity)
    VALUES (v_warehouse_id, v_product_id, v_quantity)
    ON CONFLICT (location_id, product_id)
    DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now();

    -- Save mapping for learning
    INSERT INTO product_name_mappings (raw_name, normalized_name, product_id, venue_id)
    SELECT 
      pi.raw_product_name,
      lower(trim(pi.raw_product_name)),
      v_product_id,
      v_venue_id
    FROM purchase_items pi
    WHERE pi.id = (v_item->>'item_id')::UUID
    ON CONFLICT (raw_name, venue_id) 
    DO UPDATE SET 
      product_id = EXCLUDED.product_id,
      usage_count = product_name_mappings.usage_count + 1,
      updated_at = now();

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
    v_total_amount := v_total_amount + (v_quantity * v_unit_price);
  END LOOP;

  -- Mark document as confirmed
  UPDATE purchase_documents
  SET 
    status = 'confirmed',
    total_amount = v_total_amount,
    confirmed_at = now(),
    confirmed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_purchase_document_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_items', v_total_items,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
END;
$$;

-- Update timestamp trigger
CREATE TRIGGER update_purchase_documents_updated_at
BEFORE UPDATE ON public.purchase_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();