
-- Table for waste requests that require admin approval
CREATE TABLE public.waste_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  requested_by uuid NOT NULL,
  bottle_type text NOT NULL CHECK (bottle_type IN ('cerrada', 'abierta')),
  percent_visual smallint CHECK (percent_visual IS NULL OR (percent_visual >= 0 AND percent_visual <= 100)),
  calculated_quantity numeric NOT NULL, -- ml for volumetric, units for others (always positive here)
  reason text NOT NULL CHECK (reason IN ('rota', 'botada', 'derrame', 'caducada', 'devolucion')),
  notes text,
  estimated_cost numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  jornada_id uuid REFERENCES public.jornadas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waste_requests ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users within venue can read and create
CREATE POLICY "Users can view waste requests for their venue"
  ON public.waste_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create waste requests"
  ON public.waste_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Admins can update waste requests"
  ON public.waste_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for fast lookups
CREATE INDEX idx_waste_requests_venue_status ON public.waste_requests(venue_id, status);
CREATE INDEX idx_waste_requests_created ON public.waste_requests(created_at DESC);

-- Enable realtime for waste_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_requests;
