-- Create RLS policy for developers to read all venues
CREATE POLICY "Developers can read all venues"
ON public.venues
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'developer')
);

-- Create RLS policy for developers to manage all feature flags
CREATE POLICY "Developers can manage all feature flags"
ON public.feature_flags
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'developer')
)
WITH CHECK (
  public.has_role(auth.uid(), 'developer')
);