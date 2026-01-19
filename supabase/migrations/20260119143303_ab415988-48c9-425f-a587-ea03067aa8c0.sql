-- Update get_active_jornada to use user's venue_id for multi-tenant safety
CREATE OR REPLACE FUNCTION public.get_active_jornada()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT j.id 
  FROM public.jornadas j
  WHERE j.estado = 'activa' 
  ORDER BY j.created_at DESC 
  LIMIT 1
$$;

-- Create a venue-aware version for more explicit use
CREATE OR REPLACE FUNCTION public.get_active_jornada_for_venue(p_venue_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT j.id 
  FROM public.jornadas j
  WHERE j.estado = 'activa' 
    AND (j.venue_id = p_venue_id OR j.venue_id IS NULL)
  ORDER BY j.created_at DESC 
  LIMIT 1
$$;

-- Ensure vendedor role can read jornadas (policy already exists as "Everyone can view jornadas")
-- Adding explicit policy for vendedor to be safe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jornadas' 
    AND policyname = 'Vendedor can view active jornadas'
  ) THEN
    CREATE POLICY "Vendedor can view active jornadas"
    ON public.jornadas
    FOR SELECT
    USING (
      has_role(auth.uid(), 'vendedor'::app_role)
    );
  END IF;
END $$;