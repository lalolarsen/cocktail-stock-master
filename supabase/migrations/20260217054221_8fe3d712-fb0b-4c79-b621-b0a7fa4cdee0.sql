-- Remove overly permissive SELECT policy that shows products from ALL venues
DROP POLICY IF EXISTS "products_select_authenticated" ON public.products;