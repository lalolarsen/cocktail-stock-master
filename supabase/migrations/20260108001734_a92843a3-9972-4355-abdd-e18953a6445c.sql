-- Add is_active_in_sales column to products table
-- Products created from imports default to false (pending approval)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_active_in_sales BOOLEAN DEFAULT true;

-- Set existing products as active in sales (maintain backward compatibility)
UPDATE public.products SET is_active_in_sales = true WHERE is_active_in_sales IS NULL;

-- Add index for filtering active products in POS
CREATE INDEX IF NOT EXISTS idx_products_active_in_sales ON public.products(is_active_in_sales) WHERE is_active_in_sales = true;

-- Comment for clarity
COMMENT ON COLUMN public.products.is_active_in_sales IS 'Products imported from invoices/excel start as false and require admin approval to appear in POS';