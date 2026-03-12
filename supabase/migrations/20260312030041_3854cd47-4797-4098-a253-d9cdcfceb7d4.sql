ALTER TABLE public.product_addons
ADD COLUMN IF NOT EXISTS product_id uuid;

ALTER TABLE public.product_addons
ADD COLUMN IF NOT EXISTS quantity_ml numeric;