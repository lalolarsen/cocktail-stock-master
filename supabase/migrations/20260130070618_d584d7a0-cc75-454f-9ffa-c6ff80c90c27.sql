-- Allow product_id to be null for mixer slots (product selected at redemption)
ALTER TABLE public.cocktail_ingredients 
ALTER COLUMN product_id DROP NOT NULL;