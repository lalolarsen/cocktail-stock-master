-- Add beverage tax fields to purchase_items
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS tax_iaba_10 NUMERIC DEFAULT 0,      -- Bebidas analcohólicas 10%
ADD COLUMN IF NOT EXISTS tax_iaba_18 NUMERIC DEFAULT 0,      -- Bebidas con alto azúcar 18%
ADD COLUMN IF NOT EXISTS tax_ila_vin NUMERIC DEFAULT 0,      -- Vinos, cervezas 20.5%
ADD COLUMN IF NOT EXISTS tax_ila_cer NUMERIC DEFAULT 0,      -- Cervezas 20.5% (separado para tracking)
ADD COLUMN IF NOT EXISTS tax_ila_lic NUMERIC DEFAULT 0,      -- Licores, destilados 31.5%
ADD COLUMN IF NOT EXISTS tax_category TEXT;                  -- Categoría tributaria detectada

-- Add comment for documentation
COMMENT ON COLUMN purchase_items.tax_iaba_10 IS 'Impuesto Bebidas Analcohólicas 10% (Ley 20.780 Art.42 letra a)';
COMMENT ON COLUMN purchase_items.tax_iaba_18 IS 'Impuesto Bebidas Alto Azúcar 18% (Ley 20.780 Art.42 letra a, >15g/240ml)';
COMMENT ON COLUMN purchase_items.tax_ila_vin IS 'Impuesto Licores Alcohólicas Vinos 20.5% (Ley 20.780 Art.42 letra c)';
COMMENT ON COLUMN purchase_items.tax_ila_cer IS 'Impuesto Licores Alcohólicas Cervezas 20.5% (Ley 20.780 Art.42 letra c)';
COMMENT ON COLUMN purchase_items.tax_ila_lic IS 'Impuesto Licores Destilados 31.5% (Ley 20.780 Art.42 letra b)';