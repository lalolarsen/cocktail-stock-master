
-- Centralize income/expenses with proper categorization constraints

-- 1) SALES: Ensure sale_category is constrained and pos_id is required

-- First, update any NULL pos_id values (if any exist) - this would need manual resolution in production
-- For now, we'll set a constraint going forward

-- Add check constraint for sale_category
ALTER TABLE public.sales 
DROP CONSTRAINT IF EXISTS sales_sale_category_check;

ALTER TABLE public.sales 
ADD CONSTRAINT sales_sale_category_check 
CHECK (sale_category IN ('alcohol', 'ticket'));

-- Make pos_id NOT NULL (update existing nulls first if any)
UPDATE public.sales SET pos_id = (
  SELECT pt.id FROM pos_terminals pt 
  WHERE pt.venue_id = sales.venue_id 
  AND pt.is_active = true 
  LIMIT 1
) WHERE pos_id IS NULL;

-- Now enforce NOT NULL on pos_id
ALTER TABLE public.sales 
ALTER COLUMN pos_id SET NOT NULL;

-- 2) EXPENSES: Make jornada_id required, payment_method required with canonical values

-- Add check constraint for payment_method canonical values
ALTER TABLE public.expenses 
DROP CONSTRAINT IF EXISTS expenses_payment_method_check;

ALTER TABLE public.expenses 
ADD CONSTRAINT expenses_payment_method_check 
CHECK (payment_method IN ('cash', 'card', 'transfer', 'other'));

-- Update any NULL payment_method to 'cash' as default
UPDATE public.expenses 
SET payment_method = 'cash' 
WHERE payment_method IS NULL OR payment_method = '';

-- Make payment_method NOT NULL
ALTER TABLE public.expenses 
ALTER COLUMN payment_method SET NOT NULL;

-- Make jornada_id NOT NULL (expenses must be tied to a jornada for proper tracking)
-- First update any existing nulls to the most recent closed jornada for their venue
UPDATE public.expenses e
SET jornada_id = (
  SELECT j.id FROM jornadas j 
  WHERE j.venue_id = e.venue_id 
  ORDER BY j.created_at DESC 
  LIMIT 1
)
WHERE e.jornada_id IS NULL;

-- Now enforce NOT NULL
ALTER TABLE public.expenses 
ALTER COLUMN jornada_id SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.sales.sale_category IS 'Category of sale: alcohol or ticket';
COMMENT ON COLUMN public.sales.pos_id IS 'Required: Point of sale terminal where transaction occurred';
COMMENT ON COLUMN public.expenses.jornada_id IS 'Required: Jornada during which expense was recorded';
COMMENT ON COLUMN public.expenses.payment_method IS 'Required: Payment method (cash, card, transfer, other)';
COMMENT ON COLUMN public.expenses.pos_id IS 'Optional: Specific POS for cash register expenses, NULL for general expenses';
