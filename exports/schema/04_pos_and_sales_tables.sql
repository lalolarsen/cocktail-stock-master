-- ============================================
-- DiStock Database Schema Export
-- Part 4: POS, Cocktails, Sales Tables
-- ============================================

-- ============================================
-- POS TERMINALS
-- ============================================
CREATE TABLE public.pos_terminals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  name TEXT NOT NULL,
  code TEXT,
  pos_type TEXT DEFAULT 'alcohol_sales',
  pos_kind TEXT,
  business_type TEXT,
  zone TEXT,
  location_id UUID REFERENCES public.stock_locations(id),
  is_active BOOLEAN DEFAULT true,
  is_cash_register BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_pos_terminals_venue ON public.pos_terminals(venue_id);
CREATE INDEX idx_pos_terminals_location ON public.pos_terminals(location_id);

-- ============================================
-- COCKTAILS (Menu items)
-- ============================================
CREATE TABLE public.cocktails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'otros',
  price NUMERIC DEFAULT 0,
  waste_ml_per_serving NUMERIC DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_cocktails_venue_id ON public.cocktails(venue_id);

-- ============================================
-- COCKTAIL INGREDIENTS (Recipes)
-- ============================================
CREATE TABLE public.cocktail_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cocktail_id UUID NOT NULL REFERENCES public.cocktails(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  quantity NUMERIC NOT NULL,
  is_mixer_slot BOOLEAN DEFAULT false,
  mixer_category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_cocktail_ingredients_cocktail ON public.cocktail_ingredients(cocktail_id);
CREATE INDEX idx_cocktail_ingredients_venue_id ON public.cocktail_ingredients(venue_id);

-- ============================================
-- PRODUCT ADDONS
-- ============================================
CREATE TABLE public.product_addons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  name TEXT NOT NULL,
  description TEXT,
  price_modifier NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.cocktail_addons (
  cocktail_id UUID NOT NULL REFERENCES public.cocktails(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES public.product_addons(id) ON DELETE CASCADE,
  PRIMARY KEY (cocktail_id, addon_id)
);

CREATE INDEX idx_cocktail_addons_cocktail ON public.cocktail_addons(cocktail_id);
CREATE INDEX idx_cocktail_addons_addon ON public.cocktail_addons(addon_id);

-- ============================================
-- JORNADAS (Shifts)
-- ============================================
CREATE TABLE public.jornadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  numero_jornada INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  fecha DATE NOT NULL,
  hora_apertura TIME,
  hora_cierre TIME,
  estado TEXT DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_jornadas_venue ON public.jornadas(venue_id);
CREATE INDEX idx_jornadas_fecha ON public.jornadas(fecha);
CREATE INDEX idx_jornadas_estado ON public.jornadas(estado);

-- ============================================
-- JORNADA CONFIGURATION
-- ============================================
CREATE TABLE public.jornada_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  dia_semana INTEGER NOT NULL,
  hora_apertura TIME NOT NULL,
  hora_cierre TIME NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- SALES (Alcohol sales)
-- ============================================
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  jornada_id UUID REFERENCES public.jornadas(id),
  pos_id UUID REFERENCES public.pos_terminals(id),
  bar_location_id UUID REFERENCES public.stock_locations(id),
  sale_number TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending',
  is_cancelled BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID,
  cancel_reason TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_sales_venue ON public.sales(venue_id);
CREATE INDEX idx_sales_jornada ON public.sales(jornada_id);
CREATE INDEX idx_sales_pos ON public.sales(pos_id);
CREATE INDEX idx_sales_created ON public.sales(created_at DESC);

-- ============================================
-- SALE ITEMS
-- ============================================
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  cocktail_id UUID NOT NULL REFERENCES public.cocktails(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  cogs_snapshot NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_cocktail ON public.sale_items(cocktail_id);

-- ============================================
-- PICKUP TOKENS (QR delivery system)
-- ============================================
CREATE TABLE public.pickup_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  sale_id UUID REFERENCES public.sales(id),
  ticket_sale_id UUID,
  jornada_id UUID REFERENCES public.jornadas(id),
  token TEXT NOT NULL DEFAULT substr(encode(uuid_send(gen_random_uuid()), 'hex'), 1, 16),
  status public.pickup_token_status DEFAULT 'issued',
  source_type TEXT DEFAULT 'sale',
  bar_location_id UUID REFERENCES public.stock_locations(id),
  cover_cocktail_id UUID REFERENCES public.cocktails(id),
  cover_quantity INTEGER DEFAULT 1,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '2 hours'),
  redeemed_at TIMESTAMP WITH TIME ZONE,
  redeemed_by UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX idx_pickup_tokens_token ON public.pickup_tokens(token);
CREATE INDEX idx_pickup_tokens_venue ON public.pickup_tokens(venue_id);
CREATE INDEX idx_pickup_tokens_sale ON public.pickup_tokens(sale_id);
CREATE INDEX idx_pickup_tokens_status ON public.pickup_tokens(status);
CREATE INDEX idx_pickup_tokens_jornada ON public.pickup_tokens(jornada_id);

-- ============================================
-- PICKUP REDEMPTIONS LOG
-- ============================================
CREATE TABLE public.pickup_redemptions_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  pickup_token_id UUID REFERENCES public.pickup_tokens(id),
  sale_id UUID REFERENCES public.sales(id),
  bartender_id UUID NOT NULL,
  pos_id TEXT,
  result public.redemption_result NOT NULL,
  metadata JSONB DEFAULT '{}',
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_redemptions_venue ON public.pickup_redemptions_log(venue_id);
CREATE INDEX idx_redemptions_token ON public.pickup_redemptions_log(pickup_token_id);
CREATE INDEX idx_redemptions_bartender ON public.pickup_redemptions_log(bartender_id);
