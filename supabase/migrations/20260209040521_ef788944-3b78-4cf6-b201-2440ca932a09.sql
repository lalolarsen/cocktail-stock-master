-- =============================================================================
-- SUPPLIER LEARNING SYSTEM + VENUE ISOLATION
-- =============================================================================

-- 1. FUNCIÓN DE NORMALIZACIÓN DE TEXTO
CREATE OR REPLACE FUNCTION public.normalize_invoice_text(input_text text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(input_text, 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'),
          '[^a-zA-Z0-9\s]', '', 'g'
        ),
        '\s+', ' ', 'g'
      ),
      '^\s+|\s+$', '', 'g'
    )
  );
END;
$$;

-- 2. CREAR TABLA DE ALIAS DE PRODUCTOS POR PROVEEDOR
CREATE TABLE IF NOT EXISTS public.supplier_product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  normalized_text text NOT NULL,
  raw_examples jsonb DEFAULT '[]'::jsonb,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  pack_multiplier integer DEFAULT 1,
  pack_priced boolean DEFAULT false,
  tax_category text DEFAULT 'NONE',
  confidence numeric DEFAULT 0.5,
  times_seen integer DEFAULT 1,
  last_seen timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Unique constraint por venue + proveedor + texto normalizado
  UNIQUE (venue_id, supplier_name, normalized_text)
);

-- 3. CREATE INDEXES FOR FAST LOOKUP
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_venue_lookup 
  ON public.supplier_product_aliases(venue_id, supplier_name, normalized_text);
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_product 
  ON public.supplier_product_aliases(product_id);

-- 4. ENABLE RLS ON supplier_product_aliases
ALTER TABLE public.supplier_product_aliases ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's venue
CREATE OR REPLACE FUNCTION public.get_user_venue_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT venue_id FROM public.profiles WHERE id = auth.uid()
$$;

-- RLS POLICIES for supplier_product_aliases
CREATE POLICY "Users can view aliases for their venue"
  ON public.supplier_product_aliases
  FOR SELECT
  USING (venue_id = public.get_user_venue_id());

CREATE POLICY "Users can insert aliases for their venue"
  ON public.supplier_product_aliases
  FOR INSERT
  WITH CHECK (venue_id = public.get_user_venue_id());

CREATE POLICY "Users can update aliases for their venue"
  ON public.supplier_product_aliases
  FOR UPDATE
  USING (venue_id = public.get_user_venue_id());

CREATE POLICY "Users can delete aliases for their venue"
  ON public.supplier_product_aliases
  FOR DELETE
  USING (venue_id = public.get_user_venue_id());

-- 5. FIX NULL VENUE_IDs EN PURCHASE_DOCUMENTS
-- Primero encontrar un venue por defecto desde los profiles de los usuarios que crearon los docs
UPDATE public.purchase_documents pd
SET venue_id = (
  SELECT venue_id FROM public.profiles 
  WHERE id = pd.confirmed_by AND venue_id IS NOT NULL
  LIMIT 1
)
WHERE pd.venue_id IS NULL AND pd.confirmed_by IS NOT NULL;

-- 6. MAKE venue_id NOT NULL on provider_product_mappings
-- First ensure no nulls exist
UPDATE public.provider_product_mappings ppm
SET venue_id = (
  SELECT venue_id FROM public.profiles 
  WHERE venue_id IS NOT NULL
  LIMIT 1
)
WHERE ppm.venue_id IS NULL;

ALTER TABLE public.provider_product_mappings 
  ALTER COLUMN venue_id SET NOT NULL;

-- 7. ENSURE RLS ON provider_product_mappings
ALTER TABLE public.provider_product_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view mappings for their venue" ON public.provider_product_mappings;
CREATE POLICY "Users can view mappings for their venue"
  ON public.provider_product_mappings
  FOR SELECT
  USING (venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS "Users can insert mappings for their venue" ON public.provider_product_mappings;
CREATE POLICY "Users can insert mappings for their venue"
  ON public.provider_product_mappings
  FOR INSERT
  WITH CHECK (venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS "Users can update mappings for their venue" ON public.provider_product_mappings;
CREATE POLICY "Users can update mappings for their venue"
  ON public.provider_product_mappings
  FOR UPDATE
  USING (venue_id = public.get_user_venue_id());

DROP POLICY IF EXISTS "Users can delete mappings for their venue" ON public.provider_product_mappings;
CREATE POLICY "Users can delete mappings for their venue"
  ON public.provider_product_mappings
  FOR DELETE
  USING (venue_id = public.get_user_venue_id());

-- 8. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.update_supplier_alias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_alias_updated_at ON public.supplier_product_aliases;
CREATE TRIGGER trg_supplier_alias_updated_at
  BEFORE UPDATE ON public.supplier_product_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supplier_alias_updated_at();