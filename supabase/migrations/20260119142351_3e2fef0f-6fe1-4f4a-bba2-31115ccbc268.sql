-- Create jornada audit log table
CREATE TABLE public.jornada_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('opened', 'closed', 'auto_closed', 'closed_by_new_open', 'forced_close', 'created_pending')),
  actor_user_id UUID,
  actor_source TEXT NOT NULL,
  reason TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for querying by jornada
CREATE INDEX idx_jornada_audit_log_jornada ON public.jornada_audit_log(jornada_id);
CREATE INDEX idx_jornada_audit_log_venue ON public.jornada_audit_log(venue_id);
CREATE INDEX idx_jornada_audit_log_created ON public.jornada_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.jornada_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies - admins/gerencia can read audit logs
CREATE POLICY "Admins can read jornada audit logs"
ON public.jornada_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'gerencia')
  )
);

-- System can insert audit logs
CREATE POLICY "System can insert jornada audit logs"
ON public.jornada_audit_log
FOR INSERT
WITH CHECK (true);

-- Add auto_close_enabled flag to jornada_cash_settings (reusing existing config table)
ALTER TABLE public.jornada_cash_settings 
ADD COLUMN IF NOT EXISTS auto_close_enabled BOOLEAN NOT NULL DEFAULT false;