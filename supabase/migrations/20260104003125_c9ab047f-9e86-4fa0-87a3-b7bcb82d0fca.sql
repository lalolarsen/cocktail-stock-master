
-- Fix has_role function to check both user_roles and worker_roles tables
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM public.worker_roles
    WHERE worker_id = _user_id
      AND role = _role
  )
$function$;
