-- Add code field to products table
ALTER TABLE public.products
ADD COLUMN code TEXT UNIQUE;

-- Create function to generate unique product code
CREATE OR REPLACE FUNCTION public.generate_product_code()
RETURNS TEXT
LANGUAGE plpgsql
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

-- Update existing products with codes
DO $$
DECLARE
  product_record RECORD;
  new_code TEXT;
BEGIN
  FOR product_record IN SELECT id FROM public.products WHERE code IS NULL
  LOOP
    new_code := public.generate_product_code();
    UPDATE public.products SET code = new_code WHERE id = product_record.id;
  END LOOP;
END $$;

-- Make code NOT NULL after populating existing records
ALTER TABLE public.products
ALTER COLUMN code SET NOT NULL;