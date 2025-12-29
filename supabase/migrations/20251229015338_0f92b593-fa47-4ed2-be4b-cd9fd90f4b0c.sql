-- Update RLS policies for products table to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view products" ON public.products;
CREATE POLICY "Gerencia can view products" 
ON public.products 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for cocktails table to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view cocktails" ON public.cocktails;
CREATE POLICY "Gerencia can view cocktails" 
ON public.cocktails 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for cocktail_ingredients to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view ingredients" ON public.cocktail_ingredients;
CREATE POLICY "Gerencia can view ingredients" 
ON public.cocktail_ingredients 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for sales table to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view all sales" ON public.sales;
CREATE POLICY "Gerencia can view all sales" 
ON public.sales 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for sale_items to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view all sale items" ON public.sale_items;
CREATE POLICY "Gerencia can view all sale items" 
ON public.sale_items 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for jornadas to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view jornadas" ON public.jornadas;
CREATE POLICY "Gerencia can view jornadas" 
ON public.jornadas 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for jornada_config to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view jornada config" ON public.jornada_config;
CREATE POLICY "Gerencia can view jornada config" 
ON public.jornada_config 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for expenses to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view expenses" ON public.expenses;
CREATE POLICY "Gerencia can view expenses" 
ON public.expenses 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for stock_alerts to allow gerencia SELECT  
DROP POLICY IF EXISTS "Gerencia can view stock alerts" ON public.stock_alerts;
CREATE POLICY "Gerencia can view stock alerts" 
ON public.stock_alerts 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for stock_movements to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view stock movements" ON public.stock_movements;
CREATE POLICY "Gerencia can view stock movements" 
ON public.stock_movements 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for stock_predictions to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view stock predictions" ON public.stock_predictions;
CREATE POLICY "Gerencia can view stock predictions" 
ON public.stock_predictions 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for profiles to allow gerencia SELECT on all profiles
DROP POLICY IF EXISTS "Gerencia can view all profiles" ON public.profiles;
CREATE POLICY "Gerencia can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for user_roles to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view all roles" ON public.user_roles;
CREATE POLICY "Gerencia can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for login_history to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view all login history" ON public.login_history;
CREATE POLICY "Gerencia can view all login history" 
ON public.login_history 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));

-- Update RLS policies for sales_documents to allow gerencia SELECT
DROP POLICY IF EXISTS "Gerencia can view all sales documents" ON public.sales_documents;
CREATE POLICY "Gerencia can view all sales documents" 
ON public.sales_documents 
FOR SELECT 
USING (has_role(auth.uid(), 'gerencia'::app_role));