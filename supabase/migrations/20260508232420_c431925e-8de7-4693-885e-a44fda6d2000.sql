DROP POLICY IF EXISTS "Admin/Gerencia gestionan destinatarios" ON public.jornada_notification_emails;
DROP POLICY IF EXISTS "Admin/Gerencia ven destinatarios" ON public.jornada_notification_emails;

CREATE POLICY "Admin/Gerencia gestionan destinatarios"
ON public.jornada_notification_emails
AS PERMISSIVE FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerencia'::app_role)
  OR public.has_role(auth.uid(), 'developer'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerencia'::app_role)
  OR public.has_role(auth.uid(), 'developer'::app_role)
);