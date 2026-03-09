
-- Add product_id to passline_audit_items for linking unit products
ALTER TABLE public.passline_audit_items 
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id);

-- Add financial summary columns to passline_audit_sessions
ALTER TABLE public.passline_audit_sessions 
  ADD COLUMN IF NOT EXISTS cogs_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_amount integer NOT NULL DEFAULT 0;
