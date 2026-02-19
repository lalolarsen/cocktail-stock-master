
-- Fix: Drop and recreate the products management policy with proper WITH CHECK
DROP POLICY IF EXISTS "Admins can manage products for their venue" ON public.products;

-- Recreate with explicit WITH CHECK so INSERT works
CREATE POLICY "Admins can manage products for their venue"
ON public.products
FOR ALL
TO authenticated
USING (
  (venue_id = get_user_venue_id()) 
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (venue_id = get_user_venue_id()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);
