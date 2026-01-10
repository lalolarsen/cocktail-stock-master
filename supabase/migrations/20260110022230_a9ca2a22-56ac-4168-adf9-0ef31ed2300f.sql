-- Create app_error_logs table for frontend/backend errors
CREATE TABLE public.app_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  route TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create app_audit_events table for critical action logging
CREATE TABLE public.app_audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'fail')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_audit_events ENABLE ROW LEVEL SECURITY;

-- RLS for app_error_logs
CREATE POLICY "Anyone can insert error logs"
ON public.app_error_logs
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view error logs"
ON public.app_error_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view error logs"
ON public.app_error_logs
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- RLS for app_audit_events
CREATE POLICY "Service can insert audit events"
ON public.app_audit_events
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view audit events"
ON public.app_audit_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view audit events"
ON public.app_audit_events
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Indexes for performance
CREATE INDEX idx_app_error_logs_created_at ON public.app_error_logs(created_at DESC);
CREATE INDEX idx_app_error_logs_venue_id ON public.app_error_logs(venue_id);
CREATE INDEX idx_app_audit_events_created_at ON public.app_audit_events(created_at DESC);
CREATE INDEX idx_app_audit_events_action ON public.app_audit_events(action);
CREATE INDEX idx_app_audit_events_status ON public.app_audit_events(status);
CREATE INDEX idx_app_audit_events_venue_id ON public.app_audit_events(venue_id);

-- Create function to log audit events (for use in triggers/RPC)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_status TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_venue_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.app_audit_events (venue_id, user_id, action, status, metadata)
  VALUES (p_venue_id, COALESCE(p_user_id, auth.uid()), p_action, p_status, p_metadata)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;