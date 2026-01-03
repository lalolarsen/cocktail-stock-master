-- Add notification_email to profiles (not used for auth, only for notifications)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_email text;

-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(worker_id, event_type, channel)
);

-- Create notification_logs table (append-only for audit)
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  jornada_id uuid REFERENCES public.jornadas(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_worker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  idempotency_key text UNIQUE NOT NULL,
  email_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS for notification_preferences
CREATE POLICY "Admins can manage notification preferences" ON public.notification_preferences
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view own preferences" ON public.notification_preferences
  FOR SELECT USING (worker_id = auth.uid() AND has_role(auth.uid(), 'gerencia'));

CREATE POLICY "Gerencia can update own preferences" ON public.notification_preferences
  FOR UPDATE USING (worker_id = auth.uid() AND has_role(auth.uid(), 'gerencia'));

-- RLS for notification_logs (read-only for admin/gerencia)
CREATE POLICY "Admins can view notification logs" ON public.notification_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerencia can view notification logs" ON public.notification_logs
  FOR SELECT USING (has_role(auth.uid(), 'gerencia'));

-- Prevent updates/deletes on notification_logs (append-only)
-- Only allow inserts via service role (edge functions)

-- Function to enqueue jornada close notifications
CREATE OR REPLACE FUNCTION public.enqueue_jornada_closed_notifications(p_jornada_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jornada jornadas%ROWTYPE;
  v_recipient RECORD;
  v_count integer := 0;
  v_idempotency_key text;
BEGIN
  -- Get jornada details
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada not found');
  END IF;
  
  -- Find all gerencia/admin workers who have:
  -- 1. notification_email set
  -- 2. jornada_closed preference enabled (or no preference = default enabled)
  FOR v_recipient IN
    SELECT DISTINCT 
      p.id as worker_id,
      p.notification_email,
      p.venue_id
    FROM profiles p
    INNER JOIN worker_roles wr ON wr.worker_id = p.id
    WHERE wr.role IN ('gerencia', 'admin')
      AND p.notification_email IS NOT NULL
      AND p.notification_email != ''
      AND p.is_active = true
      AND (
        -- Either has explicit preference enabled or no preference (default enabled)
        NOT EXISTS (
          SELECT 1 FROM notification_preferences np 
          WHERE np.worker_id = p.id 
            AND np.event_type = 'jornada_closed' 
            AND np.channel = 'email'
        )
        OR EXISTS (
          SELECT 1 FROM notification_preferences np 
          WHERE np.worker_id = p.id 
            AND np.event_type = 'jornada_closed' 
            AND np.channel = 'email'
            AND np.is_enabled = true
        )
      )
  LOOP
    v_idempotency_key := 'jornada_closed:' || p_jornada_id || ':' || v_recipient.notification_email;
    
    -- Insert only if not already queued (idempotent)
    INSERT INTO notification_logs (
      venue_id,
      event_type,
      jornada_id,
      recipient_email,
      recipient_worker_id,
      status,
      idempotency_key,
      email_subject
    )
    VALUES (
      v_recipient.venue_id,
      'jornada_closed',
      p_jornada_id,
      v_recipient.notification_email,
      v_recipient.worker_id,
      'queued',
      v_idempotency_key,
      'Resumen de Jornada #' || v_jornada.numero_jornada || ' - ' || v_jornada.fecha
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'queued_count', v_count,
    'jornada_id', p_jornada_id
  );
END;
$$;

-- Create index for faster log queries
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON public.notification_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_jornada ON public.notification_logs(jornada_id);