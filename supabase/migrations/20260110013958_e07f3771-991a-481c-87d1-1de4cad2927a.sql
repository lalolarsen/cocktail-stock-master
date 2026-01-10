-- Add source tracking fields to expenses table for purchase invoice linking
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id),
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_id UUID;

-- Add index for efficient querying by source
CREATE INDEX IF NOT EXISTS idx_expenses_source ON public.expenses(source_type, source_id);

-- Add index for venue filtering
CREATE INDEX IF NOT EXISTS idx_expenses_venue ON public.expenses(venue_id);

-- Comment for documentation
COMMENT ON COLUMN public.expenses.source_type IS 'Origin of expense: manual, purchase_invoice, etc.';
COMMENT ON COLUMN public.expenses.source_id IS 'Reference ID to source document (e.g., purchase_document_id)';