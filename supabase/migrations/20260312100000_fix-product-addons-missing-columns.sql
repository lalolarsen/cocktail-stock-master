-- Fix multiple missing columns/enum values that break redeem_pickup_token
-- (introduced in migration 20260312013410):
--
-- 1. product_addons.product_id / product_addons.quantity_ml
--    → The function JOINs product_addons to deduct addon stock.
--      Nullable so existing addons are unaffected (NULL = no stock deduction).
--
-- 2. pickup_redemptions_log.jornada_id
--    → The function inserts jornada_id into the audit log.
--      Nullable FK to jornadas.
--
-- 3. redemption_result enum values 'insufficient_stock' and 'not_paid'
--    → The function uses 'insufficient_stock' (prev versions used 'stock_error')
--      and 'not_paid' (used since 20260130 but never added to the enum).

-- Fix 1: product_addons missing columns
ALTER TABLE public.product_addons
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_ml numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_product_addons_product_id ON public.product_addons(product_id)
  WHERE product_id IS NOT NULL;

-- Fix 2: pickup_redemptions_log missing columns
--   jornada_id: inserted by the function into the audit log
--   delivered_by_worker_id: inserted since 20260305 but never added as a column
ALTER TABLE public.pickup_redemptions_log
  ADD COLUMN IF NOT EXISTS jornada_id uuid REFERENCES public.jornadas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_by_worker_id uuid;

CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_log_jornada_id
  ON public.pickup_redemptions_log(jornada_id)
  WHERE jornada_id IS NOT NULL;

-- Fix 3: missing redemption_result enum values
ALTER TYPE public.redemption_result ADD VALUE IF NOT EXISTS 'insufficient_stock';
ALTER TYPE public.redemption_result ADD VALUE IF NOT EXISTS 'not_paid';
