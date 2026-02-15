
-- ============================================================
-- MÓDULO PROVEEDORES / LECTOR DE FACTURAS v1
-- ============================================================

-- 1) purchase_imports (cabecera de importación)
CREATE TABLE IF NOT EXISTS public.purchase_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  supplier_name text,
  supplier_rut text,
  document_number text,
  document_date date,
  net_subtotal numeric,
  vat_amount numeric,
  total_amount numeric,
  currency text NOT NULL DEFAULT 'CLP',
  raw_file_url text,
  raw_extraction_json jsonb,
  status text NOT NULL DEFAULT 'UPLOADED',
  issues_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchase_imports for venue"
  ON public.purchase_imports FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Developer can manage purchase_imports"
  ON public.purchase_imports FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Gerencia can view purchase_imports for venue"
  ON public.purchase_imports FOR SELECT
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'gerencia'::app_role));

-- 2) purchase_import_lines (líneas extraídas)
CREATE TABLE IF NOT EXISTS public.purchase_import_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_import_id uuid NOT NULL REFERENCES public.purchase_imports(id) ON DELETE CASCADE,
  line_index int NOT NULL DEFAULT 0,
  raw_text text,
  qty_invoiced numeric,
  unit_price_net numeric,
  line_total_net numeric,
  discount_pct numeric,
  detected_multiplier int NOT NULL DEFAULT 1,
  units_real numeric NOT NULL DEFAULT 0,
  cost_unit_net numeric NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id),
  classification text NOT NULL DEFAULT 'inventory',
  tax_category_id uuid,
  status text NOT NULL DEFAULT 'REVIEW',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_import_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchase_import_lines"
  ON public.purchase_import_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.purchase_imports pi
    WHERE pi.id = purchase_import_id
    AND pi.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_imports pi
    WHERE pi.id = purchase_import_id
    AND pi.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ));

CREATE POLICY "Developer can manage purchase_import_lines"
  ON public.purchase_import_lines FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Gerencia can view purchase_import_lines"
  ON public.purchase_import_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.purchase_imports pi
    WHERE pi.id = purchase_import_id
    AND pi.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'gerencia'::app_role)
  ));

-- 3) purchase_import_taxes
CREATE TABLE IF NOT EXISTS public.purchase_import_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_import_id uuid NOT NULL REFERENCES public.purchase_imports(id) ON DELETE CASCADE,
  tax_type text NOT NULL,
  tax_label text NOT NULL,
  tax_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_import_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchase_import_taxes"
  ON public.purchase_import_taxes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.purchase_imports pi
    WHERE pi.id = purchase_import_id
    AND pi.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_imports pi
    WHERE pi.id = purchase_import_id
    AND pi.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ));

CREATE POLICY "Developer can manage purchase_import_taxes"
  ON public.purchase_import_taxes FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

-- 4) purchases (registro final confirmado)
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_import_id uuid UNIQUE REFERENCES public.purchase_imports(id),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  supplier_name text,
  supplier_rut text,
  document_number text,
  document_date date,
  net_subtotal numeric,
  vat_credit numeric,
  total_amount numeric,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchases for venue"
  ON public.purchases FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Developer can manage purchases"
  ON public.purchases FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Gerencia can view purchases for venue"
  ON public.purchases FOR SELECT
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'gerencia'::app_role));

-- 5) purchase_lines (inventariables confirmados)
CREATE TABLE IF NOT EXISTS public.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  units_real numeric NOT NULL,
  cost_unit_net numeric NOT NULL,
  line_total_net numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchase_lines"
  ON public.purchase_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
    AND p.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
    AND p.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ));

CREATE POLICY "Developer can manage purchase_lines"
  ON public.purchase_lines FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Gerencia can view purchase_lines"
  ON public.purchase_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
    AND p.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'gerencia'::app_role)
  ));

-- 6) expense_lines (gastos no inventariables confirmados)
CREATE TABLE IF NOT EXISTS public.expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  expense_type text NOT NULL DEFAULT 'freight',
  description text,
  amount_net numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage expense_lines"
  ON public.expense_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
    AND p.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
    AND p.venue_id = get_user_venue_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  ));

CREATE POLICY "Developer can manage expense_lines"
  ON public.expense_lines FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

-- 7) learning_product_mappings (aprendizaje por proveedor)
CREATE TABLE IF NOT EXISTS public.learning_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  supplier_rut text,
  raw_text text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  detected_multiplier int NOT NULL DEFAULT 1,
  confidence numeric NOT NULL DEFAULT 0.8,
  times_used int NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage learning_product_mappings"
  ON public.learning_product_mappings FOR ALL
  USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Developer can manage learning_product_mappings"
  ON public.learning_product_mappings FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

-- 8) Update specific_tax_categories: add code column if missing
ALTER TABLE public.specific_tax_categories ADD COLUMN IF NOT EXISTS code text UNIQUE;
ALTER TABLE public.specific_tax_categories ADD COLUMN IF NOT EXISTS label text;

-- Seed default tax categories if empty
INSERT INTO public.specific_tax_categories (id, name, code, label, rate_pct, is_active, venue_id)
SELECT gen_random_uuid(), 'IABA 10%', 'IABA_10', 'IABA 10% (Bebidas energéticas)', 10, true, '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE NOT EXISTS (SELECT 1 FROM public.specific_tax_categories WHERE code = 'IABA_10');

INSERT INTO public.specific_tax_categories (id, name, code, label, rate_pct, is_active, venue_id)
SELECT gen_random_uuid(), 'IABA 18%', 'IABA_18', 'IABA 18% (Bebidas alcohólicas alta graduación)', 18, true, '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE NOT EXISTS (SELECT 1 FROM public.specific_tax_categories WHERE code = 'IABA_18');

INSERT INTO public.specific_tax_categories (id, name, code, label, rate_pct, is_active, venue_id)
SELECT gen_random_uuid(), 'ILA Vinos 20.5%', 'ILA_VINO_205', 'ILA Vinos y espumantes 20.5%', 20.5, true, '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE NOT EXISTS (SELECT 1 FROM public.specific_tax_categories WHERE code = 'ILA_VINO_205');

INSERT INTO public.specific_tax_categories (id, name, code, label, rate_pct, is_active, venue_id)
SELECT gen_random_uuid(), 'ILA Cerveza 20.5%', 'ILA_CERVEZA_205', 'ILA Cerveza 20.5%', 20.5, true, '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE NOT EXISTS (SELECT 1 FROM public.specific_tax_categories WHERE code = 'ILA_CERVEZA_205');

INSERT INTO public.specific_tax_categories (id, name, code, label, rate_pct, is_active, venue_id)
SELECT gen_random_uuid(), 'ILA Destilados 31.5%', 'ILA_DEST_315', 'ILA Destilados y licores 31.5%', 31.5, true, '4e128e76-980d-4233-a438-92aa02cfb50b'
WHERE NOT EXISTS (SELECT 1 FROM public.specific_tax_categories WHERE code = 'ILA_DEST_315');

-- Storage bucket for invoice files
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-invoices', 'purchase-invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin can upload invoices"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'purchase-invoices' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can view invoices"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'purchase-invoices' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Developer can manage invoice files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'purchase-invoices' AND has_role(auth.uid(), 'developer'::app_role));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_imports_venue_status ON public.purchase_imports(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_import_lines_import ON public.purchase_import_lines(purchase_import_id);
CREATE INDEX IF NOT EXISTS idx_purchases_venue ON public.purchases(venue_id);
CREATE INDEX IF NOT EXISTS idx_learning_mappings_lookup ON public.learning_product_mappings(venue_id, supplier_rut, raw_text);

-- Updated_at trigger for purchase_imports
CREATE TRIGGER update_purchase_imports_updated_at
  BEFORE UPDATE ON public.purchase_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
