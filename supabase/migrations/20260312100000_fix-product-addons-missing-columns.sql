-- Fix: "column pa.product_id does not exist"
-- The redeem_pickup_token function (added in 20260312013410) references
-- pa.product_id and pa.quantity_ml from product_addons, but those columns
-- were never added to the table. This migration adds them as nullable columns
-- so that:
--   1. Existing addons continue to work (NULL = no stock deduction)
--   2. New addons can optionally link to a product for stock tracking

ALTER TABLE public.product_addons
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_ml numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_product_addons_product_id ON public.product_addons(product_id)
  WHERE product_id IS NOT NULL;
