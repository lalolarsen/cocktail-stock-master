-- Agregar columna para identificar productos que son mixers (bebidas para combinar)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_mixer boolean DEFAULT false;

-- Crear índice para búsqueda rápida de mixers
CREATE INDEX IF NOT EXISTS idx_products_is_mixer ON products(is_mixer) WHERE is_mixer = true;

-- Comentario descriptivo
COMMENT ON COLUMN products.is_mixer IS 'Indica si el producto puede ser seleccionado como mixer dinámico en barra (ej: Coca-Cola, Sprite, Red Bull)';