-- Create replenishment plan status enum
CREATE TYPE public.replenishment_plan_status AS ENUM ('draft', 'applied', 'cancelled');

-- Create replenishment_plans table
CREATE TABLE public.replenishment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jornada_id UUID REFERENCES public.jornadas(id) ON DELETE SET NULL,
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  name TEXT NOT NULL,
  status replenishment_plan_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create replenishment_plan_items table
CREATE TABLE public.replenishment_plan_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  replenishment_plan_id UUID NOT NULL REFERENCES public.replenishment_plans(id) ON DELETE CASCADE,
  to_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_replenishment_plan_items_plan ON public.replenishment_plan_items(replenishment_plan_id);
CREATE INDEX idx_replenishment_plan_items_location ON public.replenishment_plan_items(to_location_id);
CREATE INDEX idx_replenishment_plan_items_product ON public.replenishment_plan_items(product_id);
CREATE INDEX idx_replenishment_plans_jornada ON public.replenishment_plans(jornada_id);
CREATE INDEX idx_replenishment_plans_status ON public.replenishment_plans(status);

-- Enable RLS
ALTER TABLE public.replenishment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replenishment_plan_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for replenishment_plans
CREATE POLICY "Admins can manage replenishment plans"
ON public.replenishment_plans
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view replenishment plans"
ON public.replenishment_plans
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'));

-- RLS Policies for replenishment_plan_items
CREATE POLICY "Admins can manage replenishment plan items"
ON public.replenishment_plan_items
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view replenishment plan items"
ON public.replenishment_plan_items
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'));

-- Trigger for updated_at
CREATE TRIGGER update_replenishment_plans_updated_at
BEFORE UPDATE ON public.replenishment_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create apply_replenishment_plan function
CREATE OR REPLACE FUNCTION public.apply_replenishment_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan replenishment_plans%ROWTYPE;
  v_warehouse_id UUID;
  v_item RECORD;
  v_current_balance NUMERIC;
  v_total_required NUMERIC;
  v_insufficient_items JSONB := '[]'::JSONB;
  v_transfer_id UUID;
  v_items_moved INT := 0;
  v_bars_affected UUID[] := '{}';
  v_user_id UUID;
  v_product_totals JSONB := '{}'::JSONB;
  v_product_id UUID;
  v_product_name TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Check admin permission
  IF NOT has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized - admin only');
  END IF;
  
  -- Get and lock the plan
  SELECT * INTO v_plan FROM replenishment_plans WHERE id = p_plan_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan not found');
  END IF;
  
  IF v_plan.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan is not in draft status');
  END IF;
  
  -- Get warehouse ID
  SELECT id INTO v_warehouse_id FROM stock_locations WHERE type = 'warehouse' LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse location not found');
  END IF;
  
  -- Calculate total required per product across all bars
  FOR v_item IN
    SELECT 
      rpi.product_id,
      p.name as product_name,
      SUM(rpi.quantity) as total_qty
    FROM replenishment_plan_items rpi
    JOIN products p ON p.id = rpi.product_id
    WHERE rpi.replenishment_plan_id = p_plan_id
    GROUP BY rpi.product_id, p.name
  LOOP
    -- Get warehouse balance
    SELECT COALESCE(sb.quantity, 0) INTO v_current_balance
    FROM stock_balances sb
    WHERE sb.product_id = v_item.product_id AND sb.location_id = v_warehouse_id;
    
    IF v_current_balance IS NULL THEN
      v_current_balance := 0;
    END IF;
    
    -- Check if insufficient
    IF v_current_balance < v_item.total_qty THEN
      v_insufficient_items := v_insufficient_items || jsonb_build_object(
        'product_id', v_item.product_id,
        'product_name', v_item.product_name,
        'required', v_item.total_qty,
        'available', v_current_balance,
        'missing', v_item.total_qty - v_current_balance
      );
    END IF;
  END LOOP;
  
  -- If any insufficient items, return error
  IF jsonb_array_length(v_insufficient_items) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient warehouse stock',
      'insufficient_items', v_insufficient_items
    );
  END IF;
  
  -- Apply transfers by bar
  FOR v_item IN
    SELECT 
      rpi.to_location_id,
      sl.name as bar_name,
      rpi.product_id,
      p.name as product_name,
      rpi.quantity
    FROM replenishment_plan_items rpi
    JOIN stock_locations sl ON sl.id = rpi.to_location_id
    JOIN products p ON p.id = rpi.product_id
    WHERE rpi.replenishment_plan_id = p_plan_id
    ORDER BY rpi.to_location_id
  LOOP
    -- Deduct from warehouse
    UPDATE stock_balances
    SET quantity = quantity - v_item.quantity, updated_at = now()
    WHERE product_id = v_item.product_id AND location_id = v_warehouse_id;
    
    -- Add to bar (upsert)
    INSERT INTO stock_balances (product_id, location_id, quantity)
    VALUES (v_item.product_id, v_item.to_location_id, v_item.quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = stock_balances.quantity + v_item.quantity, updated_at = now();
    
    -- Log stock movement
    INSERT INTO stock_movements (
      product_id, 
      movement_type, 
      quantity, 
      from_location_id, 
      to_location_id, 
      jornada_id,
      notes
    )
    VALUES (
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_warehouse_id,
      v_item.to_location_id,
      v_plan.jornada_id,
      'Reposición Plan: ' || v_plan.name
    );
    
    v_items_moved := v_items_moved + 1;
    
    IF NOT v_item.to_location_id = ANY(v_bars_affected) THEN
      v_bars_affected := array_append(v_bars_affected, v_item.to_location_id);
    END IF;
  END LOOP;
  
  -- Mark plan as applied
  UPDATE replenishment_plans
  SET status = 'applied', applied_at = now(), updated_at = now()
  WHERE id = p_plan_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'items_moved', v_items_moved,
    'bars_affected', array_length(v_bars_affected, 1),
    'applied_at', now()
  );
END;
$$;