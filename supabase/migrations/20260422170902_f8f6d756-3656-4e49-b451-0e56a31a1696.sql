
-- ============================================================
-- Security hardening migration
-- ============================================================

-- 1) void_requests / void_events: fix broken correlated-subquery policies
DROP POLICY IF EXISTS "Users can read void_requests for their venue" ON public.void_requests;
DROP POLICY IF EXISTS "Authenticated users can insert void_requests" ON public.void_requests;
DROP POLICY IF EXISTS "Admin can update void_requests" ON public.void_requests;

CREATE POLICY "Users can read void_requests for their venue"
ON public.void_requests
FOR SELECT
TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "Authenticated users can insert void_requests"
ON public.void_requests
FOR INSERT
TO authenticated
WITH CHECK (
  venue_id = public.get_user_venue_id()
  AND requested_by = auth.uid()
);

CREATE POLICY "Admin can update void_requests"
ON public.void_requests
FOR UPDATE
TO authenticated
USING (
  venue_id = public.get_user_venue_id()
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role))
)
WITH CHECK (
  venue_id = public.get_user_venue_id()
);

DROP POLICY IF EXISTS "Users can read void_events for their venue" ON public.void_events;
DROP POLICY IF EXISTS "Authenticated users can insert void_events" ON public.void_events;

CREATE POLICY "Users can read void_events for their venue"
ON public.void_events
FOR SELECT
TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "Authenticated users can insert void_events"
ON public.void_events
FOR INSERT
TO authenticated
WITH CHECK (venue_id = public.get_user_venue_id());

-- 2) provider_product_mappings: drop blanket-true policy
DROP POLICY IF EXISTS "Admin can manage provider mappings" ON public.provider_product_mappings;

-- 3) jornada_bar_assignments: enable RLS and add venue-scoped policies
ALTER TABLE public.jornada_bar_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jornada_bar_assignments_select" ON public.jornada_bar_assignments;
DROP POLICY IF EXISTS "jornada_bar_assignments_insert" ON public.jornada_bar_assignments;
DROP POLICY IF EXISTS "jornada_bar_assignments_update" ON public.jornada_bar_assignments;
DROP POLICY IF EXISTS "jornada_bar_assignments_delete" ON public.jornada_bar_assignments;

CREATE POLICY "jornada_bar_assignments_select"
ON public.jornada_bar_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jornadas j
    WHERE j.id = jornada_bar_assignments.jornada_id
      AND j.venue_id = public.get_user_venue_id()
  )
);

CREATE POLICY "jornada_bar_assignments_insert"
ON public.jornada_bar_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.jornadas j
    WHERE j.id = jornada_bar_assignments.jornada_id
      AND j.venue_id = public.get_user_venue_id()
  )
);

CREATE POLICY "jornada_bar_assignments_update"
ON public.jornada_bar_assignments
FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.jornadas j
    WHERE j.id = jornada_bar_assignments.jornada_id
      AND j.venue_id = public.get_user_venue_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jornadas j
    WHERE j.id = jornada_bar_assignments.jornada_id
      AND j.venue_id = public.get_user_venue_id()
  )
);

CREATE POLICY "jornada_bar_assignments_delete"
ON public.jornada_bar_assignments
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerencia'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.jornadas j
    WHERE j.id = jornada_bar_assignments.jornada_id
      AND j.venue_id = public.get_user_venue_id()
  )
);

-- 4) open_bottles / open_bottle_events: add venue scoping
DROP POLICY IF EXISTS "open_bottles_select" ON public.open_bottles;
DROP POLICY IF EXISTS "open_bottles_insert" ON public.open_bottles;
DROP POLICY IF EXISTS "open_bottles_update" ON public.open_bottles;

CREATE POLICY "open_bottles_select"
ON public.open_bottles
FOR SELECT
TO authenticated
USING (venue_id = public.get_user_venue_id());

CREATE POLICY "open_bottles_insert"
ON public.open_bottles
FOR INSERT
TO authenticated
WITH CHECK (venue_id = public.get_user_venue_id());

CREATE POLICY "open_bottles_update"
ON public.open_bottles
FOR UPDATE
TO authenticated
USING (venue_id = public.get_user_venue_id())
WITH CHECK (venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS "open_bottle_events_select" ON public.open_bottle_events;
DROP POLICY IF EXISTS "open_bottle_events_insert" ON public.open_bottle_events;

CREATE POLICY "open_bottle_events_select"
ON public.open_bottle_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.open_bottles ob
    WHERE ob.id = open_bottle_events.open_bottle_id
      AND ob.venue_id = public.get_user_venue_id()
  )
);

CREATE POLICY "open_bottle_events_insert"
ON public.open_bottle_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.open_bottles ob
    WHERE ob.id = open_bottle_events.open_bottle_id
      AND ob.venue_id = public.get_user_venue_id()
  )
);

-- 5) cash_registers: remove public-readable policy
DROP POLICY IF EXISTS "Everyone can view cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Admins can manage cash registers" ON public.cash_registers;

-- 6) notification_logs: remove permissive INSERT policy, replace with admin-only
DROP POLICY IF EXISTS "Allow insert for service role and enqueue function" ON public.notification_logs;

CREATE POLICY "Admins can insert notification logs"
ON public.notification_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
