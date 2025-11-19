-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for product categories
CREATE TYPE product_category AS ENUM ('con_alcohol', 'sin_alcohol', 'mixers', 'garnish', 'otros');

-- Create enum for movement types
CREATE TYPE movement_type AS ENUM ('entrada', 'salida', 'ajuste', 'compra');

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category product_category NOT NULL,
  current_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(10,2) NOT NULL DEFAULT 10,
  unit TEXT NOT NULL DEFAULT 'ml',
  cost_per_unit DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stock movements table
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type movement_type NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create alerts table
CREATE TABLE public.stock_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL DEFAULT 'low_stock',
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create predictions table for AI forecasting
CREATE TABLE public.stock_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  predicted_consumption DECIMAL(10,2) NOT NULL,
  prediction_period TEXT NOT NULL,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_predictions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (single admin user for now)
CREATE POLICY "Allow all operations on products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on stock_movements" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on stock_alerts" ON public.stock_alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on stock_predictions" ON public.stock_predictions FOR ALL USING (true) WITH CHECK (true);

-- Create function to automatically create alerts when stock is low
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_stock <= NEW.minimum_stock THEN
    INSERT INTO public.stock_alerts (product_id, alert_type, message)
    VALUES (
      NEW.id,
      'low_stock',
      'Stock bajo: ' || NEW.name || ' tiene solo ' || NEW.current_stock || ' ' || NEW.unit
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for low stock alerts
CREATE TRIGGER trigger_check_low_stock
AFTER UPDATE OF current_stock ON public.products
FOR EACH ROW
EXECUTE FUNCTION check_low_stock();

-- Create function to update stock after movement
CREATE OR REPLACE FUNCTION update_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type = 'entrada' OR NEW.movement_type = 'compra' THEN
    UPDATE public.products
    SET current_stock = current_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'salida' THEN
    UPDATE public.products
    SET current_stock = current_stock - NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'ajuste' THEN
    UPDATE public.products
    SET current_stock = NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stock movements
CREATE TRIGGER trigger_update_stock
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_movement();

-- Insert sample data
INSERT INTO public.products (name, category, current_stock, minimum_stock, unit, cost_per_unit) VALUES
('Ron Blanco', 'con_alcohol', 5000, 2000, 'ml', 0.03),
('Vodka', 'con_alcohol', 3000, 1500, 'ml', 0.025),
('Gin', 'con_alcohol', 2500, 1500, 'ml', 0.035),
('Tequila', 'con_alcohol', 2000, 1000, 'ml', 0.04),
('Whisky', 'con_alcohol', 1500, 1000, 'ml', 0.05),
('Jugo de Naranja', 'sin_alcohol', 3000, 1500, 'ml', 0.005),
('Jugo de Piña', 'sin_alcohol', 2500, 1500, 'ml', 0.005),
('Agua Tónica', 'mixers', 4000, 2000, 'ml', 0.003),
('Coca Cola', 'mixers', 4500, 2000, 'ml', 0.002),
('Limones', 'garnish', 50, 20, 'unidad', 0.5),
('Menta Fresca', 'garnish', 30, 15, 'manojo', 1.0),
('Hielo', 'otros', 10000, 5000, 'g', 0.001);