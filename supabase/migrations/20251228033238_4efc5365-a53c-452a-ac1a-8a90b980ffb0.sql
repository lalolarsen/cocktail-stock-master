-- Create expenses table for operational and non-operational expenses
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_type TEXT NOT NULL CHECK (expense_type IN ('operacional', 'no_operacional')),
  category TEXT,
  jornada_id UUID REFERENCES public.jornadas(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable Row Level Security
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can manage expenses" 
ON public.expenses 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policy for viewing expenses
CREATE POLICY "Everyone can view expenses" 
ON public.expenses 
FOR SELECT 
USING (true);

-- Create index for better performance
CREATE INDEX idx_expenses_jornada ON public.expenses(jornada_id);
CREATE INDEX idx_expenses_type ON public.expenses(expense_type);
CREATE INDEX idx_expenses_created_at ON public.expenses(created_at DESC);