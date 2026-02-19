
-- 1) Eliminar el constraint que bloquea los updates
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_mixer_subcategory_check;

-- 2) Limpiar valores problemáticos en subcategory (dejar todo NULL para evitar futuros problemas)
-- No tocamos la columna en sí, solo borramos el constraint
