DROP POLICY IF EXISTS "Admins can manage ticket types for their venue" ON public.ticket_types;

CREATE POLICY "Admins manage ticket types"
ON public.ticket_types
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerencia'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerencia'::app_role));