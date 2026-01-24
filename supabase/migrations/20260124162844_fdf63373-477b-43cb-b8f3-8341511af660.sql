-- Migrate all legacy payment methods to canonical values
-- debit, credit -> card
UPDATE sales SET payment_method = 'card' WHERE payment_method IN ('debit', 'credit');
UPDATE ticket_sales SET payment_method = 'card' WHERE payment_method IN ('debit', 'credit');

-- transfer -> cash (as per requirements)
UPDATE sales SET payment_method = 'cash' WHERE payment_method = 'transfer';
UPDATE ticket_sales SET payment_method = 'cash' WHERE payment_method = 'transfer';

-- Update expenses table constraint to only allow cash and card
ALTER TABLE public.expenses 
DROP CONSTRAINT IF EXISTS expenses_payment_method_check;

ALTER TABLE public.expenses 
ADD CONSTRAINT expenses_payment_method_check 
CHECK (payment_method IN ('cash', 'card'));

-- Update any existing expenses with legacy values
UPDATE public.expenses SET payment_method = 'cash' WHERE payment_method NOT IN ('cash', 'card');

-- Add comment to document the canonical values
COMMENT ON TYPE payment_method IS 'Canonical values: cash, card. Legacy values (debit, credit, transfer) are deprecated and should not be used.';