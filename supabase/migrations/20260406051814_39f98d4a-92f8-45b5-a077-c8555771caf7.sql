
-- stock_import_batches: tracks each Excel upload lifecycle
CREATE TABLE public.stock_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  batch_type text NOT NULL CHECK (batch_type IN ('COMPRA','TRANSFERENCIA','CONTEO')),
  status text NOT NULL DEFAULT 'pendiente_aprobacion' CHECK (status IN ('pendiente_aprobacion','aprobado','rechazado')),
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  file_name text,
  summary_json jsonb NOT NULL DEFAULT '{}',
  row_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- stock_import_rows: individual rows parsed from Excel
CREATE TABLE public.stock_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.stock_import_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}',
  product_id uuid REFERENCES public.products(id),
  product_name_excel text,
  product_name_matched text,
  match_confidence text CHECK (match_confidence IN ('alta','media','baja','sin_match')),
  tipo_consumo text,
  unidad_detectada text,
  location_destino_id uuid,
  location_origen_id uuid,
  quantity numeric,
  unit_cost numeric,
  computed_base_qty numeric,
  stock_teorico numeric,
  stock_real numeric,
  errors text[] DEFAULT '{}',
  is_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.stock_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_import_rows ENABLE ROW LEVEL SECURITY;

-- Batches: authenticated users can read their venue's batches
CREATE POLICY "Users can view own venue batches"
  ON public.stock_import_batches FOR SELECT TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

-- Batches: authenticated users can insert
CREATE POLICY "Users can insert batches"
  ON public.stock_import_batches FOR INSERT TO authenticated
  WITH CHECK (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

-- Batches: authenticated users can update (approve/reject)
CREATE POLICY "Users can update own venue batches"
  ON public.stock_import_batches FOR UPDATE TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid()));

-- Rows: authenticated users can read rows of their venue's batches
CREATE POLICY "Users can view own venue batch rows"
  ON public.stock_import_rows FOR SELECT TO authenticated
  USING (batch_id IN (SELECT id FROM public.stock_import_batches WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));

-- Rows: authenticated users can insert
CREATE POLICY "Users can insert batch rows"
  ON public.stock_import_rows FOR INSERT TO authenticated
  WITH CHECK (batch_id IN (SELECT id FROM public.stock_import_batches WHERE venue_id IN (SELECT venue_id FROM public.profiles WHERE id = auth.uid())));
