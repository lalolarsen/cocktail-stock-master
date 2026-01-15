-- Add receipt_mode to invoicing_config
-- 'hybrid' = cash issues receipt internally, card uses external POS receipt
-- 'unified' = both payment methods issue receipt internally

ALTER TABLE public.invoicing_config
ADD COLUMN IF NOT EXISTS receipt_mode text NOT NULL DEFAULT 'hybrid'
CHECK (receipt_mode IN ('hybrid', 'unified'));

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_invoicing_config_receipt_mode ON public.invoicing_config(receipt_mode);

-- Ensure there's always one config row (upsert pattern)
INSERT INTO public.invoicing_config (id, active_provider, receipt_mode)
VALUES ('00000000-0000-0000-0000-000000000001', 'mock', 'hybrid')
ON CONFLICT (id) DO NOTHING;