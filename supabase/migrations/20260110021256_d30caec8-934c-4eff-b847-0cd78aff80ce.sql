-- Create feature_flags table
CREATE TABLE public.feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(venue_id, feature_key)
);

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS policies - workers can read flags for their venue
CREATE POLICY "Workers can read feature flags for their venue"
ON public.feature_flags
FOR SELECT
USING (
  venue_id IN (
    SELECT venue_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Admins can manage feature flags
CREATE POLICY "Admins can manage feature flags"
ON public.feature_flags
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.worker_roles wr
    WHERE wr.worker_id = auth.uid()
    AND wr.role = 'admin'
    AND wr.venue_id = feature_flags.venue_id
  )
);

-- Create index for fast lookups
CREATE INDEX idx_feature_flags_venue_key ON public.feature_flags(venue_id, feature_key);

-- Insert default flags for demo venue (Berlin)
INSERT INTO public.feature_flags (venue_id, feature_key, enabled)
SELECT v.id, f.key, f.enabled
FROM public.venues v
CROSS JOIN (
  VALUES 
    ('invoice_reader', true),
    ('invoice_to_expense', true),
    ('advanced_inventory', true),
    ('advanced_reporting', true),
    ('erp_accounting', false)
) AS f(key, enabled)
WHERE v.is_demo = true
ON CONFLICT (venue_id, feature_key) DO NOTHING;