-- Add rut_code and venue_id to profiles, add internal_email and is_active
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS rut_code text,
ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id),
ADD COLUMN IF NOT EXISTS internal_email text,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create unique constraint on venue_id + rut_code
CREATE UNIQUE INDEX IF NOT EXISTS profiles_venue_rut_unique ON public.profiles(venue_id, rut_code) WHERE rut_code IS NOT NULL AND venue_id IS NOT NULL;

-- Create worker_roles table for multi-role support (replaces single role in user_roles)
CREATE TABLE IF NOT EXISTS public.worker_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id),
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_roles_unique UNIQUE(worker_id, role)
);

-- Enable RLS
ALTER TABLE public.worker_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_roles
CREATE POLICY "Admins can manage worker roles" ON public.worker_roles
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own worker roles" ON public.worker_roles
  FOR SELECT USING (worker_id = auth.uid());

CREATE POLICY "Gerencia can view worker roles" ON public.worker_roles
  FOR SELECT USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Create login_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rut_code text NOT NULL,
  venue_id uuid REFERENCES public.venues(id),
  success boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on login_attempts
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anyone (for tracking attempts before auth)
CREATE POLICY "Anyone can insert login attempts" ON public.login_attempts
  FOR INSERT WITH CHECK (true);

-- Only admins can view login attempts
CREATE POLICY "Admins can view login attempts" ON public.login_attempts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Create admin_audit_logs table for tracking admin actions
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  target_worker_id uuid REFERENCES public.profiles(id),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view/insert audit logs
CREATE POLICY "Admins can manage audit logs" ON public.admin_audit_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to check if account is locked (5 failed attempts in 15 minutes)
CREATE OR REPLACE FUNCTION public.is_account_locked(p_rut_code text, p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) >= 5
  FROM public.login_attempts
  WHERE rut_code = p_rut_code
    AND (venue_id = p_venue_id OR (venue_id IS NULL AND p_venue_id IS NULL))
    AND success = false
    AND attempted_at > now() - interval '15 minutes'
$$;

-- Function to get worker by RUT code
CREATE OR REPLACE FUNCTION public.get_worker_by_rut(p_rut_code text, p_venue_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  internal_email text,
  is_active boolean,
  rut_code text,
  venue_id uuid,
  roles app_role[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.internal_email,
    COALESCE(p.is_active, true) as is_active,
    p.rut_code,
    p.venue_id,
    COALESCE(
      (SELECT ARRAY_AGG(wr.role) FROM public.worker_roles wr WHERE wr.worker_id = p.id),
      (SELECT ARRAY_AGG(ur.role) FROM public.user_roles ur WHERE ur.user_id = p.id)
    ) as roles
  FROM public.profiles p
  WHERE p.rut_code = p_rut_code
    AND (p_venue_id IS NULL OR p.venue_id = p_venue_id OR p.venue_id IS NULL)
  LIMIT 1
$$;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_rut_code text,
  p_venue_id uuid,
  p_success boolean,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.login_attempts (rut_code, venue_id, success, ip_address, user_agent)
  VALUES (p_rut_code, p_venue_id, p_success, p_ip_address, p_user_agent)
$$;

-- Function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text,
  p_target_worker_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.admin_audit_logs (admin_id, action, target_worker_id, details)
  VALUES (auth.uid(), p_action, p_target_worker_id, p_details)
  RETURNING id
$$;

-- Function to get worker roles (returns array of roles for a worker)
CREATE OR REPLACE FUNCTION public.get_worker_roles(p_worker_id uuid)
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ARRAY_AGG(role) FROM public.worker_roles WHERE worker_id = p_worker_id),
    (SELECT ARRAY_AGG(role) FROM public.user_roles WHERE user_id = p_worker_id)
  )
$$;