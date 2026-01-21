-- Create jornada_cash_closings table for per-POS cash reconciliation
CREATE TABLE public.jornada_cash_closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE CASCADE,
  pos_id UUID NOT NULL REFERENCES public.pos_terminals(id),
  opening_cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_sales_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash_counted NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate entries per jornada/pos
CREATE UNIQUE INDEX idx_jornada_cash_closings_unique ON public.jornada_cash_closings(jornada_id, pos_id);

-- Create index for faster lookups
CREATE INDEX idx_jornada_cash_closings_jornada ON public.jornada_cash_closings(jornada_id);
CREATE INDEX idx_jornada_cash_closings_venue ON public.jornada_cash_closings(venue_id);

-- Enable RLS
ALTER TABLE public.jornada_cash_closings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage cash closings"
ON public.jornada_cash_closings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view cash closings"
ON public.jornada_cash_closings
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

CREATE POLICY "Authenticated users can view cash closings"
ON public.jornada_cash_closings
FOR SELECT
USING (auth.uid() IS NOT NULL);