-- Add receipt_source column to sales table
-- 'internal' = receipt issued through our system (cash sales)
-- 'external' = receipt handled by external POS (card sales)
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS receipt_source TEXT DEFAULT 'internal';

-- Add index for receipt_source queries
CREATE INDEX IF NOT EXISTS idx_sales_receipt_source ON sales(receipt_source);

-- Add comment
COMMENT ON COLUMN public.sales.receipt_source IS 'Source of receipt: internal (system issued) or external (external POS)';