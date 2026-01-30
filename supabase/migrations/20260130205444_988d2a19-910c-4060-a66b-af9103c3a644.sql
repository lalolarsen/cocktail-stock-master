-- Add DELETE policy for profiles table to allow admins to delete workers
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for worker_roles
CREATE POLICY "Admins can delete worker roles"
ON public.worker_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for user_roles  
CREATE POLICY "Admins can delete user roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for login_history
CREATE POLICY "Admins can delete login history"
ON public.login_history
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for notification_preferences
CREATE POLICY "Admins can delete notification preferences"
ON public.notification_preferences
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for notification_logs
CREATE POLICY "Admins can delete notification logs"
ON public.notification_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for admin_audit_logs
CREATE POLICY "Admins can delete audit logs"
ON public.admin_audit_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));