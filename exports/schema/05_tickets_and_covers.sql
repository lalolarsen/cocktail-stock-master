-- ============================================
-- DiStock Database Schema Export
-- Part 5: Tickets & Covers Module
-- ============================================

-- ============================================
-- TICKET TYPES
-- ============================================
CREATE TABLE public.ticket_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  includes_cover BOOLEAN DEFAULT false,
  cover_cocktail_id UUID REFERENCES public.cocktails(id),
  cover_quantity INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_ticket_types_venue ON public.ticket_types(venue_id);

-- ============================================
-- TICKET SALES
-- ============================================
CREATE TABLE public.ticket_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  jornada_id UUID REFERENCES public.jornadas(id),
  pos_id UUID REFERENCES public.pos_terminals(id),
  ticket_number TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending',
  is_cancelled BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_ticket_sales_venue ON public.ticket_sales(venue_id);
CREATE INDEX idx_ticket_sales_jornada ON public.ticket_sales(jornada_id);

-- Add FK to pickup_tokens
ALTER TABLE public.pickup_tokens 
  ADD CONSTRAINT pickup_tokens_ticket_sale_id_fkey 
  FOREIGN KEY (ticket_sale_id) REFERENCES public.ticket_sales(id);

-- ============================================
-- TICKET SALE ITEMS
-- ============================================
CREATE TABLE public.ticket_sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_sale_id UUID NOT NULL REFERENCES public.ticket_sales(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_ticket_sale_items_sale ON public.ticket_sale_items(ticket_sale_id);
