-- Fix pickup_tokens to allow NULL sale_id for ticket-based tokens
-- The table already has source_type and ticket_sale_id columns

-- Step 1: Drop the existing NOT NULL constraint on sale_id
-- First we need to drop the FK constraint, make column nullable, then re-add FK
ALTER TABLE public.pickup_tokens 
  ALTER COLUMN sale_id DROP NOT NULL;

-- The FK constraint already exists with ON DELETE CASCADE, we just needed to make the column nullable
-- Now ticket covers can be created with sale_id = NULL, using ticket_sale_id instead

-- Add a check constraint to ensure at least one source is provided
ALTER TABLE public.pickup_tokens
  ADD CONSTRAINT pickup_tokens_source_check 
  CHECK (sale_id IS NOT NULL OR ticket_sale_id IS NOT NULL);

-- Add comment for documentation
COMMENT ON COLUMN public.pickup_tokens.sale_id IS 'Reference to sales table for bar/cocktail sales. NULL for ticket-based covers.';
COMMENT ON COLUMN public.pickup_tokens.source_type IS 'Type of source: sale (bar sales) or ticket (ticket covers)';
COMMENT ON COLUMN public.pickup_tokens.ticket_sale_id IS 'Reference to ticket_sales table for ticket-based covers. NULL for bar sales.';