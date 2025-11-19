-- Add point_of_sale column to profiles table
ALTER TABLE public.profiles ADD COLUMN point_of_sale text;

-- Add comment
COMMENT ON COLUMN public.profiles.point_of_sale IS 'Punto de venta asignado al usuario';

-- Update RLS policy to allow admins to update point_of_sale
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));