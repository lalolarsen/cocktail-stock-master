-- Add outside_jornada column to sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS outside_jornada boolean NOT NULL DEFAULT false;

-- Create index for efficient querying of outside_jornada sales
CREATE INDEX IF NOT EXISTS idx_sales_outside_jornada ON public.sales(outside_jornada) WHERE outside_jornada = true;

-- Comment for clarity
COMMENT ON COLUMN public.sales.outside_jornada IS 'True if sale was made when no jornada was active. Must be assigned to a jornada before final closure.';