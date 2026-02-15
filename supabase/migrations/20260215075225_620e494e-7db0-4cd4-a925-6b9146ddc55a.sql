
-- Specific tax categories (rate config)
CREATE TABLE public.specific_tax_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  rate_pct numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.specific_tax_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tax categories for their venue"
  ON public.specific_tax_categories FOR SELECT
  USING (venue_id = get_user_venue_id() OR venue_id IS NULL);

CREATE POLICY "Admins can manage tax categories"
  ON public.specific_tax_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed global default categories (venue_id = NULL means global)
INSERT INTO public.specific_tax_categories (name, rate_pct, venue_id) VALUES
  ('Sin impuesto', 0, NULL),
  ('ILA Licores 31.5%', 31.5, NULL),
  ('ILA Vinos 20.5%', 20.5, NULL),
  ('IABA Bebidas Azucaradas 18%', 18, NULL),
  ('IABA Bebidas No Azucaradas 10%', 10, NULL);

-- Stock intake batches
CREATE TABLE public.stock_intake_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  default_location_id uuid REFERENCES public.stock_locations(id),
  total_net numeric NOT NULL DEFAULT 0,
  total_vat numeric NOT NULL DEFAULT 0,
  total_specific_tax numeric NOT NULL DEFAULT 0,
  total_other_tax numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  notes text
);

ALTER TABLE public.stock_intake_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view intake batches for their venue"
  ON public.stock_intake_batches FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage intake batches"
  ON public.stock_intake_batches FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Stock intake items (per line)
CREATE TABLE public.stock_intake_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.stock_intake_batches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  quantity numeric NOT NULL,
  net_unit_cost numeric NOT NULL,
  vat_unit numeric NOT NULL DEFAULT 0,
  specific_tax_unit numeric NOT NULL DEFAULT 0,
  other_tax_unit numeric NOT NULL DEFAULT 0,
  total_unit numeric NOT NULL DEFAULT 0,
  total_line numeric NOT NULL DEFAULT 0,
  tax_category_id uuid REFERENCES public.specific_tax_categories(id),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_intake_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view intake items for their venue"
  ON public.stock_intake_items FOR SELECT
  USING (venue_id = get_user_venue_id());

CREATE POLICY "Admins can manage intake items"
  ON public.stock_intake_items FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));
