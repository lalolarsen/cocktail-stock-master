-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create cocktails table (recipes)
CREATE TABLE public.cocktails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'otros',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.cocktails ENABLE ROW LEVEL SECURITY;

-- Create cocktail_ingredients table (recipe ingredients)
CREATE TABLE public.cocktail_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cocktail_id UUID REFERENCES public.cocktails(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.cocktail_ingredients ENABLE ROW LEVEL SECURITY;

-- Create sales table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number TEXT NOT NULL,
  seller_id UUID REFERENCES auth.users(id) NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  point_of_sale TEXT NOT NULL,
  is_cancelled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create sale_items table
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  cocktail_id UUID REFERENCES public.cocktails(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Function to handle new user creation (create profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update stock when sale is created
CREATE OR REPLACE FUNCTION public.process_sale_stock()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ingredient_record RECORD;
BEGIN
  -- Loop through each sale item
  FOR ingredient_record IN
    SELECT 
      ci.product_id,
      ci.quantity * NEW.quantity AS total_quantity
    FROM public.cocktail_ingredients ci
    WHERE ci.cocktail_id = NEW.cocktail_id
  LOOP
    -- Update stock for each ingredient
    UPDATE public.products
    SET current_stock = current_stock - ingredient_record.total_quantity,
        updated_at = NOW()
    WHERE id = ingredient_record.product_id;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger to update stock on sale
CREATE TRIGGER on_sale_item_created
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.process_sale_stock();

-- Function to restore stock when sale is cancelled
CREATE OR REPLACE FUNCTION public.cancel_sale_stock()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record RECORD;
  ingredient_record RECORD;
BEGIN
  IF NEW.is_cancelled = TRUE AND OLD.is_cancelled = FALSE THEN
    -- Loop through each sale item
    FOR item_record IN
      SELECT cocktail_id, quantity
      FROM public.sale_items
      WHERE sale_id = NEW.id
    LOOP
      -- Loop through each ingredient
      FOR ingredient_record IN
        SELECT product_id, quantity
        FROM public.cocktail_ingredients
        WHERE cocktail_id = item_record.cocktail_id
      LOOP
        -- Restore stock
        UPDATE public.products
        SET current_stock = current_stock + (ingredient_record.quantity * item_record.quantity),
            updated_at = NOW()
        WHERE id = ingredient_record.product_id;
      END LOOP;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to restore stock when sale is cancelled
CREATE TRIGGER on_sale_cancelled
  AFTER UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_sale_stock();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for cocktails
CREATE POLICY "Everyone can view cocktails"
  ON public.cocktails FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage cocktails"
  ON public.cocktails FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for cocktail_ingredients
CREATE POLICY "Everyone can view ingredients"
  ON public.cocktail_ingredients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage ingredients"
  ON public.cocktail_ingredients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for sales
CREATE POLICY "Users can view their own sales"
  ON public.sales FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

CREATE POLICY "Admins can view all sales"
  ON public.sales FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can create sales"
  ON public.sales FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'vendedor') AND auth.uid() = seller_id);

CREATE POLICY "Sellers can cancel their own sales"
  ON public.sales FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor') AND auth.uid() = seller_id);

CREATE POLICY "Admins can manage all sales"
  ON public.sales FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for sale_items
CREATE POLICY "Users can view their sale items"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE sales.id = sale_items.sale_id
      AND sales.seller_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all sale items"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can create sale items"
  ON public.sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE sales.id = sale_items.sale_id
      AND sales.seller_id = auth.uid()
      AND public.has_role(auth.uid(), 'vendedor')
    )
  );

CREATE POLICY "Admins can manage all sale items"
  ON public.sale_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));