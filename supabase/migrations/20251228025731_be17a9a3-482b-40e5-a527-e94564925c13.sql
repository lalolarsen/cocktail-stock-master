-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create jornadas table
CREATE TABLE public.jornadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_jornada INTEGER NOT NULL CHECK (numero_jornada BETWEEN 1 AND 7),
  semana_inicio DATE NOT NULL,
  fecha DATE NOT NULL,
  hora_apertura TIME,
  hora_cierre TIME,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activa', 'cerrada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create jornada schedule configuration table
CREATE TABLE public.jornada_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_apertura TIME NOT NULL,
  hora_cierre TIME NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(dia_semana)
);

-- Enable RLS
ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_config ENABLE ROW LEVEL SECURITY;

-- Policies for jornadas
CREATE POLICY "Everyone can view jornadas" 
ON public.jornadas FOR SELECT USING (true);

CREATE POLICY "Admins can manage jornadas" 
ON public.jornadas FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Policies for jornada_config
CREATE POLICY "Everyone can view jornada config" 
ON public.jornada_config FOR SELECT USING (true);

CREATE POLICY "Admins can manage jornada config" 
ON public.jornada_config FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add jornada_id to existing tables
ALTER TABLE public.sales ADD COLUMN jornada_id UUID REFERENCES public.jornadas(id);
ALTER TABLE public.login_history ADD COLUMN jornada_id UUID REFERENCES public.jornadas(id);
ALTER TABLE public.stock_movements ADD COLUMN jornada_id UUID REFERENCES public.jornadas(id);
ALTER TABLE public.stock_alerts ADD COLUMN jornada_id UUID REFERENCES public.jornadas(id);

-- Create indexes
CREATE INDEX idx_jornadas_fecha ON public.jornadas(fecha);
CREATE INDEX idx_jornadas_estado ON public.jornadas(estado);
CREATE INDEX idx_jornadas_semana ON public.jornadas(semana_inicio, numero_jornada);
CREATE INDEX idx_sales_jornada ON public.sales(jornada_id);
CREATE INDEX idx_login_history_jornada ON public.login_history(jornada_id);
CREATE INDEX idx_stock_movements_jornada ON public.stock_movements(jornada_id);
CREATE INDEX idx_stock_alerts_jornada ON public.stock_alerts(jornada_id);

-- Get active jornada function
CREATE OR REPLACE FUNCTION public.get_active_jornada()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.jornadas WHERE estado = 'activa' ORDER BY created_at DESC LIMIT 1
$$;

-- Trigger for updated_at
CREATE TRIGGER update_jornadas_updated_at
BEFORE UPDATE ON public.jornadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();