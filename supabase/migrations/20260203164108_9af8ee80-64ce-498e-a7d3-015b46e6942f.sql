-- Catalogo de add-ons disponibles
CREATE TABLE public.product_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_modifier numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Relacion: que productos del menu pueden tener que add-ons
CREATE TABLE public.cocktail_addons (
  cocktail_id uuid REFERENCES public.cocktails(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.product_addons(id) ON DELETE CASCADE,
  PRIMARY KEY (cocktail_id, addon_id)
);

-- Registro de add-ons aplicados en cada item de venta
CREATE TABLE public.sale_item_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.product_addons(id) ON DELETE SET NULL,
  addon_name text NOT NULL,
  price_modifier numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indices para rendimiento
CREATE INDEX idx_product_addons_venue ON public.product_addons(venue_id);
CREATE INDEX idx_cocktail_addons_cocktail ON public.cocktail_addons(cocktail_id);
CREATE INDEX idx_cocktail_addons_addon ON public.cocktail_addons(addon_id);
CREATE INDEX idx_sale_item_addons_item ON public.sale_item_addons(sale_item_id);

-- Trigger para updated_at
CREATE TRIGGER update_product_addons_updated_at
  BEFORE UPDATE ON public.product_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cocktail_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_item_addons ENABLE ROW LEVEL SECURITY;

-- Politicas para product_addons (mismo patron que cocktails)
CREATE POLICY "Users can view addons from their venue"
  ON public.product_addons FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert addons for their venue"
  ON public.product_addons FOR INSERT
  WITH CHECK (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update addons from their venue"
  ON public.product_addons FOR UPDATE
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete addons from their venue"
  ON public.product_addons FOR DELETE
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

-- Politicas para cocktail_addons
CREATE POLICY "Users can view cocktail_addons from their venue"
  ON public.cocktail_addons FOR SELECT
  USING (addon_id IN (SELECT id FROM public.product_addons WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can insert cocktail_addons for their venue"
  ON public.cocktail_addons FOR INSERT
  WITH CHECK (addon_id IN (SELECT id FROM public.product_addons WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can delete cocktail_addons from their venue"
  ON public.cocktail_addons FOR DELETE
  USING (addon_id IN (SELECT id FROM public.product_addons WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

-- Politicas para sale_item_addons
CREATE POLICY "Users can view sale_item_addons from their venue"
  ON public.sale_item_addons FOR SELECT
  USING (sale_item_id IN (
    SELECT si.id FROM public.sale_items si 
    JOIN public.sales s ON s.id = si.sale_id 
    WHERE s.venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Users can insert sale_item_addons for their venue"
  ON public.sale_item_addons FOR INSERT
  WITH CHECK (sale_item_id IN (
    SELECT si.id FROM public.sale_items si 
    JOIN public.sales s ON s.id = si.sale_id 
    WHERE s.venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())
  ));