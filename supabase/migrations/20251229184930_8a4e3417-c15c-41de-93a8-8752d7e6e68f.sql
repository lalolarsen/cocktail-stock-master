-- Add provider columns to sales_documents table
ALTER TABLE public.sales_documents 
ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mock',
ADD COLUMN IF NOT EXISTS provider_ref text;

-- Create enum for provider types if needed for future validation
COMMENT ON COLUMN public.sales_documents.provider IS 'Invoice provider: mock, bsale, nubox, sii';
COMMENT ON COLUMN public.sales_documents.provider_ref IS 'External reference ID from the provider';

-- Create config table for active provider
CREATE TABLE IF NOT EXISTS public.invoicing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active_provider text NOT NULL DEFAULT 'mock',
  config jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoicing_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoicing_config
CREATE POLICY "Everyone can view invoicing config"
ON public.invoicing_config FOR SELECT
USING (true);

CREATE POLICY "Admins can manage invoicing config"
ON public.invoicing_config FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Insert default config
INSERT INTO public.invoicing_config (active_provider, config)
VALUES ('mock', '{"success_rate": 0.95}')
ON CONFLICT DO NOTHING;

-- Add trigger for updated_at
CREATE TRIGGER update_invoicing_config_updated_at
BEFORE UPDATE ON public.invoicing_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();