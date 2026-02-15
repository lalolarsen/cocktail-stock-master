
-- Table for per-location minimum stock thresholds
CREATE TABLE public.stock_location_minimums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  minimum_stock NUMERIC NOT NULL DEFAULT 0,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, location_id)
);

ALTER TABLE public.stock_location_minimums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view minimums for their venue"
  ON public.stock_location_minimums FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage minimums for their venue"
  ON public.stock_location_minimums FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can manage minimums for their venue"
  ON public.stock_location_minimums FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'gerencia'::app_role));

-- Add tax tracking columns to stock_movements for compliance
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS specific_tax_amount NUMERIC DEFAULT 0;

-- Enable realtime for stock_location_minimums
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_location_minimums;
