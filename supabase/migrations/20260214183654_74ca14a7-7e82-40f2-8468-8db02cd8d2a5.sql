
-- Add specific_tax_amount to purchase_documents
ALTER TABLE public.purchase_documents
ADD COLUMN IF NOT EXISTS specific_tax_amount numeric DEFAULT 0;
