
-- Add column to mark ingredients as "mixer slot" (interchangeable at redemption time)
ALTER TABLE cocktail_ingredients
ADD COLUMN is_mixer_slot boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN cocktail_ingredients.is_mixer_slot IS 'When true, this ingredient can be replaced with a compatible mixer at redemption time by the bartender';
