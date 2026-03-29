
-- Table for replenishment requests from bars/POS that need admin approval
CREATE TABLE public.replenishment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  location_id uuid NOT NULL REFERENCES public.stock_locations(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  requested_quantity numeric NOT NULL,
  requested_by_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.replenishment_requests ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view replenishment requests
CREATE POLICY "Authenticated users can view replenishment requests"
  ON public.replenishment_requests FOR SELECT TO authenticated
  USING (true);

-- Any authenticated user can create replenishment requests
CREATE POLICY "Authenticated users can create replenishment requests"
  ON public.replenishment_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by_user_id);

-- Only admins can update (approve/reject)
CREATE POLICY "Admins can update replenishment requests"
  ON public.replenishment_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_replenishment_requests_venue_status ON public.replenishment_requests(venue_id, status);
CREATE INDEX idx_replenishment_requests_location ON public.replenishment_requests(location_id);
CREATE INDEX idx_replenishment_requests_created ON public.replenishment_requests(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.replenishment_requests;
