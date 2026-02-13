
-- Add tax/financial columns to operational_expenses
ALTER TABLE public.operational_expenses
  ADD COLUMN IF NOT EXISTS net_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS specific_tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS tax_notes text;

-- Migrate existing data: set net_amount and total_amount from amount
UPDATE public.operational_expenses
SET net_amount = amount,
    total_amount = amount
WHERE net_amount = 0 AND amount > 0;

-- Standardize categories for existing rows  
UPDATE public.operational_expenses SET category = 'insumos_operativos' WHERE category = 'insumos';
UPDATE public.operational_expenses SET category = 'operacion_local' WHERE category = 'mantencion';
UPDATE public.operational_expenses SET category = 'administracion' WHERE category = 'otros';
