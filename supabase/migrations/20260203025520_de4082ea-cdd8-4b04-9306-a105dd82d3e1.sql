-- Add subcategory column to products for inventory classification
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory text;

-- Create an index for faster filtering by subcategory
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory) WHERE subcategory IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.subcategory IS 'Product classification: botellas_1000, botellas_750, botellines, mixers_latas, mixers_redbull, jugos, aguas, bebidas_1500';