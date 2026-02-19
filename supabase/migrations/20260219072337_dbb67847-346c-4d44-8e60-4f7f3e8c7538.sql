
-- Ampliar la política de gestión de productos para incluir gerencia y developer
-- además de admin
DROP POLICY IF EXISTS "Admins can manage products for their venue" ON public.products;

CREATE POLICY "Admins and managers can manage products for their venue"
ON public.products
FOR ALL
TO authenticated
USING (
  venue_id = get_user_venue_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gerencia'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  )
)
WITH CHECK (
  venue_id = get_user_venue_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gerencia'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  )
);
