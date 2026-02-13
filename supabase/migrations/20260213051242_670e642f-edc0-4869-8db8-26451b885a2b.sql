
-- Create operational_expenses table
CREATE TABLE public.operational_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  category text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

-- Enable RLS
ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;

-- Admin can fully manage for their venue
CREATE POLICY "Admins can manage operational expenses"
ON public.operational_expenses
FOR ALL
USING (
  venue_id = get_user_venue_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Gerencia can view for their venue
CREATE POLICY "Gerencia can view operational expenses"
ON public.operational_expenses
FOR SELECT
USING (
  venue_id = get_user_venue_id()
  AND has_role(auth.uid(), 'gerencia'::app_role)
);

-- Gerencia can insert operational expenses
CREATE POLICY "Gerencia can insert operational expenses"
ON public.operational_expenses
FOR INSERT
WITH CHECK (
  venue_id = get_user_venue_id()
  AND has_role(auth.uid(), 'gerencia'::app_role)
);

-- Index for fast MTD queries
CREATE INDEX idx_operational_expenses_venue_date ON public.operational_expenses (venue_id, expense_date);
