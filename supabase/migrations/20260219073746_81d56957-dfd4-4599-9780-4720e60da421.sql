
-- 1) Limpiar subcategories inválidas en mixers (liberar filas rotas)
UPDATE public.products
SET subcategory = NULL
WHERE is_mixer = true
  AND subcategory IS NOT NULL
  AND subcategory NOT IN ('MIXER_TRADICIONAL', 'REDBULL', 'mixer_tradicional', 'mixers_tradicionales', 'redbull');

-- 2) Reemplazar el constraint por uno más permisivo
--    La lógica de mixer ahora vive en la columna `category`, no en `subcategory`
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_mixer_subcategory_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_mixer_subcategory_check
  CHECK (
    -- Si NO es mixer: subcategory libre
    is_mixer = false
    OR
    -- Si ES mixer: subcategory puede ser NULL (fuente de verdad = category)
    subcategory IS NULL
    OR
    -- O uno de los valores históricos aceptados
    subcategory IN ('MIXER_TRADICIONAL', 'REDBULL', 'mixer_tradicional', 'mixers_tradicionales', 'redbull')
  );
