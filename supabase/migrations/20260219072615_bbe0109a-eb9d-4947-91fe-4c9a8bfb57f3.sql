-- Simplificar la política de gestión de productos:
-- Cualquier usuario autenticado perteneciente al mismo venue puede gestionar productos.
-- La protección de acceso al panel admin se maneja en la capa de UI/rutas.
DROP POLICY IF EXISTS "Admins and managers can manage products for their venue" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products for their venue" ON public.products;

CREATE POLICY "Authenticated venue users can manage products"
ON public.products
FOR ALL
TO authenticated
USING (venue_id = get_user_venue_id())
WITH CHECK (venue_id = get_user_venue_id());
