-- Fix: "column pa.product_id does not exist" and
--      "column jornada_id of relation pickup_redemptions_log does not exist"
--
-- The redeem_pickup_token function (added in 20260312013410) references
-- columns that were never created:
--
-- 1. product_addons.product_id / product_addons.quantity_ml
--    → The function JOINs product_addons to deduct stock for sale addons.
--      Nullable so existing addons are unaffected (NULL = no stock deduction).
--
-- 2. pickup_redemptions_log.jornada_id
--    → The function inserts jornada_id into the audit log for traceability.
--      Nullable FK to jornadas.

-- Fix 1: product_addons missing columns
ALTER TABLE public.product_addons
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_ml numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_product_addons_product_id ON public.product_addons(product_id)
  WHERE product_id IS NOT NULL;

-- Fix 2: pickup_redemptions_log missing jornada_id
ALTER TABLE public.pickup_redemptions_log
  ADD COLUMN IF NOT EXISTS jornada_id uuid REFERENCES public.jornadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_log_jornada_id
  ON public.pickup_redemptions_log(jornada_id)
  WHERE jornada_id IS NOT NULL;
