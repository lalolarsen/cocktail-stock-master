-- ============================================
-- DiStock Database Schema Export
-- Part 9: Audit Logs & Notifications
-- ============================================

-- ============================================
-- APP AUDIT EVENTS
-- ============================================
CREATE TABLE public.app_audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  user_id UUID,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_app_audit_events_venue_id ON public.app_audit_events(venue_id);
CREATE INDEX idx_app_audit_events_action ON public.app_audit_events(action);
CREATE INDEX idx_app_audit_events_status ON public.app_audit_events(status);
CREATE INDEX idx_app_audit_events_created_at ON public.app_audit_events(created_at DESC);
CREATE INDEX idx_app_audit_events_venue_created_at ON public.app_audit_events(venue_id, created_at DESC);

-- ============================================
-- APP ERROR LOGS
-- ============================================
CREATE TABLE public.app_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  user_id UUID,
  route TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_app_error_logs_venue_id ON public.app_error_logs(venue_id);
CREATE INDEX idx_app_error_logs_created_at ON public.app_error_logs(created_at DESC);

-- ============================================
-- ADMIN AUDIT LOGS
-- ============================================
CREATE TABLE public.admin_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  target_worker_id UUID REFERENCES public.profiles(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_admin_audit_logs_venue ON public.admin_audit_logs(venue_id);

-- ============================================
-- LOGIN ATTEMPTS
-- ============================================
CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  rut_code TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- LOGIN HISTORY
-- ============================================
CREATE TABLE public.login_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  user_id UUID NOT NULL,
  jornada_id UUID REFERENCES public.jornadas(id),
  ip_address TEXT,
  user_agent TEXT,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  worker_id UUID NOT NULL REFERENCES public.profiles(id),
  event_type TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- NOTIFICATION LOGS
-- ============================================
CREATE TABLE public.notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID REFERENCES public.jornadas(id),
  recipient_worker_id UUID REFERENCES public.profiles(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  email_subject TEXT,
  status TEXT DEFAULT 'queued',
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- DEMO EVENT LOGS
-- ============================================
CREATE TABLE public.demo_event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  user_id UUID,
  user_role TEXT,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
