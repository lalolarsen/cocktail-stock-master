-- Creamos el nuevo enum con las unidades de medida
CREATE TYPE public.product_category_new AS ENUM ('ml', 'gramos', 'unidades');

-- Añadimos una columna temporal con el nuevo tipo
ALTER TABLE public.products ADD COLUMN category_new product_category_new;

-- Actualizamos los productos existentes a la nueva categoría basándonos en su unidad actual
UPDATE public.products
SET category_new = CASE 
  WHEN unit = 'ml' THEN 'ml'::product_category_new
  WHEN unit = 'g' THEN 'gramos'::product_category_new
  ELSE 'unidades'::product_category_new
END;

-- Eliminamos la columna vieja
ALTER TABLE public.products DROP COLUMN category;

-- Eliminamos el enum viejo
DROP TYPE IF EXISTS public.product_category;

-- Renombramos el nuevo tipo al nombre original
ALTER TYPE public.product_category_new RENAME TO product_category;

-- Renombramos la columna nueva al nombre original
ALTER TABLE public.products RENAME COLUMN category_new TO category;

-- Hacemos la columna NOT NULL
ALTER TABLE public.products ALTER COLUMN category SET NOT NULL;