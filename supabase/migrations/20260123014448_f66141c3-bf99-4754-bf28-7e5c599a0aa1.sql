-- Add pos_type and is_cash_register to pos_terminals
ALTER TABLE public.pos_terminals
ADD COLUMN pos_type text NOT NULL DEFAULT 'alcohol_sales'
CHECK (pos_type IN ('alcohol_sales', 'ticket_sales', 'bar_redemption'));

ALTER TABLE public.pos_terminals
ADD COLUMN is_cash_register boolean NOT NULL DEFAULT true;

-- Add sale_category to sales
ALTER TABLE public.sales
ADD COLUMN sale_category text NOT NULL DEFAULT 'alcohol'
CHECK (sale_category IN ('alcohol', 'ticket'));

-- Update is_cash_register based on pos_type for existing data
-- bar_redemption POS should not be cash registers
UPDATE public.pos_terminals
SET is_cash_register = CASE WHEN pos_type = 'bar_redemption' THEN false ELSE true END;

-- Create index for efficient querying by pos_type
CREATE INDEX idx_pos_terminals_pos_type ON public.pos_terminals(pos_type);

-- Create index for efficient querying by sale_category
CREATE INDEX idx_sales_sale_category ON public.sales(sale_category);

-- Create index for cash register filtering
CREATE INDEX idx_pos_terminals_is_cash_register ON public.pos_terminals(is_cash_register) WHERE is_cash_register = true;