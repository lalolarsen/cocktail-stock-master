
-- Drop old waste_requests table (recreate with new schema)
-- First drop indexes and policies, then table
DROP TABLE IF EXISTS public.waste_requests CASCADE;

-- Create new waste_requests table with the correct schema
CREATE TABLE public.waste_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_type text NOT NULL DEFAULT 'unit' CHECK (unit_type IN ('ml', 'unit')),
  reason text NOT NULL,
  notes text,
  evidence_url text,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  requested_by_user_id uuid NOT NULL,
  approved_by_user_id uuid,
  approved_at timestamptz,
  rejection_reason text,
  -- Legacy audit fields (kept for backward compat)
  bottle_type text CHECK (bottle_type IN ('cerrada', 'abierta')),
  percent_visual smallint CHECK (percent_visual IS NULL OR (percent_visual >= 0 AND percent_visual <= 100)),
  estimated_cost numeric DEFAULT 0,
  jornada_id uuid REFERENCES public.jornadas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waste_requests ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view waste requests for their venue
-- (venue isolation enforced by joining venue_id check in app layer)
CREATE POLICY "Authenticated users can view waste requests"
  ON public.waste_requests FOR SELECT TO authenticated
  USING (true);

-- Any authenticated user can create waste requests (must match their user_id)
CREATE POLICY "Authenticated users can create waste requests"
  ON public.waste_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by_user_id);

-- Only admins can approve/reject (UPDATE)
-- Gerencia role also allowed (using has_role check)
CREATE POLICY "Admins and gerencia can update waste requests"
  ON public.waste_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'gerencia')
  );

-- Nobody can delete waste requests
-- (no DELETE policy = blocked by RLS)

-- Indexes
CREATE INDEX idx_waste_requests_venue_status ON public.waste_requests(venue_id, status);
CREATE INDEX idx_waste_requests_created ON public.waste_requests(created_at DESC);
CREATE INDEX idx_waste_requests_venue_product ON public.waste_requests(venue_id, product_id);
CREATE INDEX idx_waste_requests_location ON public.waste_requests(location_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_requests;
