CREATE POLICY "products_select_authenticated"
ON public.products FOR SELECT
TO authenticated
USING (true);