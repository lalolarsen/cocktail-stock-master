
-- Add capacity_ml column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS capacity_ml integer;

-- Temporarily disable the cost validation trigger
ALTER TABLE public.products DISABLE TRIGGER enforce_product_cost;

-- Backfill capacity_ml from subcategory
UPDATE public.products SET capacity_ml = 1500 WHERE subcategory = 'botellas_1500';
UPDATE public.products SET capacity_ml = 1000 WHERE subcategory = 'botellas_1000';
UPDATE public.products SET capacity_ml = 750 WHERE subcategory = 'botellas_750';
UPDATE public.products SET capacity_ml = 700 WHERE subcategory = 'botellas_700';

-- Re-enable the trigger
ALTER TABLE public.products ENABLE TRIGGER enforce_product_cost;
