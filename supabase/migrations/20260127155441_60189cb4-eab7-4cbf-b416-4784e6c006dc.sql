-- 1) First, clear referencing data in correct order
-- Nullify cover_cocktail_id in pickup_tokens
UPDATE public.pickup_tokens SET cover_cocktail_id = NULL WHERE cover_cocktail_id IS NOT NULL;

-- Delete sale_items first (references cocktails)
DELETE FROM public.sale_items;

-- Delete sales (parent of sale_items, but items already deleted)
DELETE FROM public.sales;

-- Now delete cocktail data
DELETE FROM public.cocktail_ingredients;
DELETE FROM public.cocktails;

-- 2) Make venue_id NOT NULL on cocktails (it already exists but is nullable)
ALTER TABLE public.cocktails 
ALTER COLUMN venue_id SET NOT NULL;

-- 3) Add venue_id to cocktail_ingredients
ALTER TABLE public.cocktail_ingredients 
ADD COLUMN venue_id uuid NOT NULL REFERENCES public.venues(id);

-- 4) Create index for performance
CREATE INDEX IF NOT EXISTS idx_cocktail_ingredients_venue_id ON public.cocktail_ingredients(venue_id);
CREATE INDEX IF NOT EXISTS idx_cocktails_venue_id ON public.cocktails(venue_id);

-- 5) Update RLS policies for cocktails
DROP POLICY IF EXISTS "Admins can manage cocktails" ON public.cocktails;
DROP POLICY IF EXISTS "Everyone can view cocktails" ON public.cocktails;
DROP POLICY IF EXISTS "Gerencia can view cocktails" ON public.cocktails;

CREATE POLICY "Admins can manage cocktails for their venue" 
ON public.cocktails 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can view cocktails for their venue" 
ON public.cocktails 
FOR SELECT 
USING (
  venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid())
);

-- 6) Update RLS policies for cocktail_ingredients
DROP POLICY IF EXISTS "Admins can manage ingredients" ON public.cocktail_ingredients;
DROP POLICY IF EXISTS "Everyone can view ingredients" ON public.cocktail_ingredients;
DROP POLICY IF EXISTS "Gerencia can view ingredients" ON public.cocktail_ingredients;

CREATE POLICY "Admins can manage ingredients for their venue" 
ON public.cocktail_ingredients 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can view ingredients for their venue" 
ON public.cocktail_ingredients 
FOR SELECT 
USING (
  venue_id IN (SELECT venue_id FROM profiles WHERE id = auth.uid())
);