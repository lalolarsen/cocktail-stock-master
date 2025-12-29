-- Create payment_method enum
CREATE TYPE public.payment_method AS ENUM ('cash', 'debit', 'credit', 'transfer');

-- Add payment_method to sales table (default to cash for existing records)
ALTER TABLE public.sales ADD COLUMN payment_method public.payment_method NOT NULL DEFAULT 'cash';

-- Create cash_registers table
CREATE TABLE public.cash_registers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE CASCADE,
  opening_cash NUMERIC NOT NULL DEFAULT 0,
  closing_cash NUMERIC,
  expected_cash NUMERIC,
  difference NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(jornada_id)
);

-- Enable RLS
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

-- RLS policies for cash_registers
CREATE POLICY "Admins can manage cash registers"
ON public.cash_registers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view cash registers"
ON public.cash_registers
FOR SELECT
USING (true);

CREATE POLICY "Gerencia can view cash registers"
ON public.cash_registers
FOR SELECT
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_cash_registers_updated_at
BEFORE UPDATE ON public.cash_registers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();