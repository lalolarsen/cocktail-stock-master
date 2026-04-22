-- ============================================================
-- Fix MISSING_RLS_PROTECTION on active_worker_sessions
-- ============================================================
DROP POLICY IF EXISTS "aws_insert_authenticated" ON public.active_worker_sessions;
DROP POLICY IF EXISTS "aws_select_authenticated" ON public.active_worker_sessions;
DROP POLICY IF EXISTS "aws_update_authenticated" ON public.active_worker_sessions;

-- SELECT: same venue only
CREATE POLICY "aws_select_same_venue"
ON public.active_worker_sessions
FOR SELECT
TO authenticated
USING (venue_id = public.get_user_venue_id());

-- INSERT: only your own session in your own venue
CREATE POLICY "aws_insert_own_in_venue"
ON public.active_worker_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  venue_id = public.get_user_venue_id()
  AND worker_id = auth.uid()
);

-- UPDATE: only your own session, or admin/gerencia in same venue
CREATE POLICY "aws_update_own_or_admin"
ON public.active_worker_sessions
FOR UPDATE
TO authenticated
USING (
  venue_id = public.get_user_venue_id()
  AND (
    worker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'gerencia'::app_role)
  )
)
WITH CHECK (
  venue_id = public.get_user_venue_id()
);

-- DELETE: admin/gerencia in same venue
CREATE POLICY "aws_delete_admin"
ON public.active_worker_sessions
FOR DELETE
TO authenticated
USING (
  venue_id = public.get_user_venue_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'gerencia'::app_role)
  )
);

-- ============================================================
-- Fix PRIVILEGE_ESCALATION on user_roles
-- ============================================================
-- Replace the catch-all "Admins can manage roles" (FOR ALL) with
-- granular policies that prevent admins from granting elevated
-- 'admin' or 'developer' roles directly via the table. Those must
-- go through controlled server-side flows (Edge Functions / SECURITY
-- DEFINER RPCs) instead.

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;

-- Admins may insert non-elevated roles only
CREATE POLICY "Admins can insert non-elevated roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role NOT IN ('admin'::app_role, 'developer'::app_role)
);

-- Admins may update non-elevated roles only (and not promote to elevated)
CREATE POLICY "Admins can update non-elevated roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role NOT IN ('admin'::app_role, 'developer'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role NOT IN ('admin'::app_role, 'developer'::app_role)
);

-- Admins may delete non-elevated roles only
CREATE POLICY "Admins can delete non-elevated roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role NOT IN ('admin'::app_role, 'developer'::app_role)
);
