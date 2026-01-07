-- Create gross_income_entries table
CREATE TABLE public.gross_income_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('sale', 'ticket', 'manual')),
  source_id UUID,
  amount INTEGER NOT NULL,
  description TEXT,
  jornada_id UUID REFERENCES public.jornadas(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gross_income_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage gross income entries"
ON public.gross_income_entries
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view gross income entries"
ON public.gross_income_entries
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

CREATE POLICY "Gerencia can create manual income entries"
ON public.gross_income_entries
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerencia'::app_role) AND source_type = 'manual');

CREATE POLICY "Sellers can create sale income entries"
ON public.gross_income_entries
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'vendedor'::app_role) 
  AND source_type = 'sale' 
  AND created_by = auth.uid()
);

CREATE POLICY "Ticket sellers can create ticket income entries"
ON public.gross_income_entries
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'ticket_seller'::app_role) 
  AND source_type = 'ticket' 
  AND created_by = auth.uid()
);

-- Index for fast aggregation queries
CREATE INDEX idx_gross_income_entries_created_at ON public.gross_income_entries(created_at);
CREATE INDEX idx_gross_income_entries_jornada_id ON public.gross_income_entries(jornada_id);
CREATE INDEX idx_gross_income_entries_source ON public.gross_income_entries(source_type, source_id);