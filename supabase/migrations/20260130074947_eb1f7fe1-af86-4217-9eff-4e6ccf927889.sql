-- Add mixer_category column to cocktail_ingredients
-- This allows distinguishing between different mixer types (latas vs redbull)
-- The specific product is chosen at redemption time in the bar

ALTER TABLE public.cocktail_ingredients 
ADD COLUMN mixer_category TEXT NULL;

-- Add a check constraint to ensure valid mixer categories
ALTER TABLE public.cocktail_ingredients
ADD CONSTRAINT valid_mixer_category 
CHECK (mixer_category IS NULL OR mixer_category IN ('latas', 'redbull'));

-- Add a check to ensure mixer_category is only set when is_mixer_slot is true
-- and product_id is null for mixer slots
ALTER TABLE public.cocktail_ingredients
ADD CONSTRAINT mixer_slot_consistency
CHECK (
  (is_mixer_slot = false AND mixer_category IS NULL) OR
  (is_mixer_slot = true AND product_id IS NULL)
);