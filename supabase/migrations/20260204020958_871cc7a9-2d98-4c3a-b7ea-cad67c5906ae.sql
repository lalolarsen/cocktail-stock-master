-- =============================================================================
-- PURCHASE IMPORT DRAFTS - Persistent draft storage for invoice import flow
-- =============================================================================

-- Create drafts table for purchase import persistence
CREATE TABLE public.purchase_import_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Document metadata
  purchase_document_id UUID REFERENCES public.purchase_documents(id) ON DELETE SET NULL,
  provider_name TEXT,
  provider_rut TEXT,
  document_number TEXT,
  document_date TEXT,
  net_amount NUMERIC DEFAULT 0,
  iva_amount NUMERIC DEFAULT 0,
  total_amount_gross NUMERIC DEFAULT 0,
  
  -- Raw extraction from AI (preserved for debugging)
  raw_extraction JSONB,
  
  -- Computed lines (single source of truth)
  computed_lines JSONB NOT NULL DEFAULT '[]'::JSONB,
  
  -- Discount mode for document
  discount_mode TEXT DEFAULT 'APPLY_TO_GROSS',
  
  -- Status tracking
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'abandoned')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for user+venue+status queries
CREATE INDEX idx_purchase_import_drafts_user_venue ON public.purchase_import_drafts(user_id, venue_id, status);

-- Enable RLS
ALTER TABLE public.purchase_import_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own drafts in their venue
CREATE POLICY "Users can view their own drafts" 
  ON public.purchase_import_drafts 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create drafts" 
  ON public.purchase_import_drafts 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts" 
  ON public.purchase_import_drafts 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drafts" 
  ON public.purchase_import_drafts 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_purchase_import_drafts_updated_at
  BEFORE UPDATE ON public.purchase_import_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Add expense_category to expenses table for TAX_EXPENSE tracking
-- =============================================================================

-- Add source columns to expenses if they don't exist (for linking to purchase imports)
DO $$
BEGIN
  -- Check if expense_category column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'expenses' 
    AND column_name = 'expense_category'
  ) THEN
    ALTER TABLE public.expenses ADD COLUMN expense_category TEXT;
  END IF;
  
  -- Check if tax_type column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'expenses' 
    AND column_name = 'tax_type'
  ) THEN
    ALTER TABLE public.expenses ADD COLUMN tax_type TEXT;
  END IF;
END $$;

-- Create comment for documentation
COMMENT ON TABLE public.purchase_import_drafts IS 'Stores draft state for purchase invoice import flow to prevent data loss on refresh';
COMMENT ON COLUMN public.purchase_import_drafts.computed_lines IS 'JSONB array of ComputedLine objects - single source of truth for calculations';
COMMENT ON COLUMN public.expenses.expense_category IS 'High-level category: operational, tax_expense, etc.';
COMMENT ON COLUMN public.expenses.tax_type IS 'For tax expenses: IABA10, IABA18, ILA_VINO_20_5, ILA_CERVEZA_20_5, ILA_DESTILADOS_31_5';