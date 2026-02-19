
-- Add CHECK constraint: if is_mixer=true then subcategory must be MIXER_TRADICIONAL or REDBULL
ALTER TABLE public.products
ADD CONSTRAINT products_mixer_subcategory_check
CHECK (
  is_mixer = false
  OR subcategory IN ('MIXER_TRADICIONAL', 'REDBULL')
);
