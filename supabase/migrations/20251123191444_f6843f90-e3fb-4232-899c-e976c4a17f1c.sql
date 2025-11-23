-- Fix function search_path security issue
CREATE OR REPLACE FUNCTION public.generate_product_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  counter INTEGER := 1;
BEGIN
  LOOP
    new_code := 'PROD-' || LPAD(counter::TEXT, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM public.products WHERE code = new_code) INTO code_exists;
    
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
    
    counter := counter + 1;
  END LOOP;
END;
$$;