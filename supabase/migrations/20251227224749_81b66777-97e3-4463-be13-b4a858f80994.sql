-- Add worker_pin column to profiles for worker identification
ALTER TABLE public.profiles 
ADD COLUMN worker_pin TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.worker_pin IS 'PIN de identificación del trabajador para acceso al sistema de ventas';