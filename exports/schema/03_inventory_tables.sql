-- ============================================
-- DiStock Database Schema Export
-- Part 3: Inventory & Products Tables
-- ============================================

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category public.product_category NOT NULL,
  subcategory TEXT,
  unit TEXT DEFAULT 'ml',
  current_stock NUMERIC DEFAULT 0,
  minimum_stock NUMERIC DEFAULT 10,
  cost_per_unit NUMERIC DEFAULT 0,
  is_mixer BOOLEAN DEFAULT false,
  is_active_in_sales BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_products_venue_id ON public.products(venue_id);
CREATE INDEX idx_products_category ON public.products(category);

-- ============================================
-- STOCK LOCATIONS (Warehouse, Bars)
-- ============================================
CREATE TABLE public.stock_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  name TEXT NOT NULL,
  type public.location_type NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stock_locations_venue_id ON public.stock_locations(venue_id);
CREATE INDEX idx_stock_locations_type ON public.stock_locations(type);

-- ============================================
-- STOCK BALANCES (Aggregated stock per product/location)
-- ============================================
CREATE TABLE public.stock_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, location_id)
);

CREATE INDEX idx_stock_balances_product ON public.stock_balances(product_id);
CREATE INDEX idx_stock_balances_location ON public.stock_balances(location_id);

-- ============================================
-- STOCK LOTS (FIFO/FEFO tracking)
-- ============================================
CREATE TABLE public.stock_lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  expires_at DATE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stock_lots_product ON public.stock_lots(product_id);
CREATE INDEX idx_stock_lots_location ON public.stock_lots(location_id);
CREATE INDEX idx_stock_lots_expires ON public.stock_lots(expires_at);

-- ============================================
-- LOCATION STOCK (Alternative location tracking)
-- ============================================
CREATE TABLE public.location_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(location_id, product_id)
);

-- ============================================
-- STOCK MOVEMENTS
-- ============================================
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  movement_type public.movement_type NOT NULL,
  quantity NUMERIC NOT NULL,
  from_location_id UUID REFERENCES public.stock_locations(id),
  to_location_id UUID REFERENCES public.stock_locations(id),
  jornada_id UUID,
  stock_lot_id UUID REFERENCES public.stock_lots(id),
  pickup_token_id UUID,
  unit_cost NUMERIC,
  notes TEXT,
  source_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_jornada ON public.stock_movements(jornada_id);
CREATE INDEX idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at DESC);

-- ============================================
-- STOCK ALERTS
-- ============================================
CREATE TABLE public.stock_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stock_alerts_product ON public.stock_alerts(product_id);
CREATE INDEX idx_stock_alerts_unread ON public.stock_alerts(is_read) WHERE is_read = false;

-- ============================================
-- STOCK PREDICTIONS (AI-generated)
-- ============================================
CREATE TABLE public.stock_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  predicted_consumption NUMERIC,
  prediction_period TEXT DEFAULT '7_days',
  confidence_score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- STOCK TRANSFERS
-- ============================================
CREATE TABLE public.stock_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  from_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  to_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  jornada_id UUID,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.stock_transfer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- REPLENISHMENT PLANS
-- ============================================
CREATE TABLE public.replenishment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  name TEXT NOT NULL,
  status public.replenishment_plan_status DEFAULT 'draft',
  jornada_id UUID,
  created_by UUID,
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.replenishment_plan_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  replenishment_plan_id UUID NOT NULL REFERENCES public.replenishment_plans(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  to_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
