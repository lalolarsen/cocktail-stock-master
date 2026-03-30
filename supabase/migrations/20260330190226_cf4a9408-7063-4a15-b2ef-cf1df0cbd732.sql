
-- Enums for void workflow
CREATE TYPE public.void_request_type AS ENUM ('pre_redeem','post_redeem','unknown');
CREATE TYPE public.void_request_status AS ENUM ('pending','approved','rejected','executed','cancelled');
CREATE TYPE public.void_execution_mode AS ENUM ('void_only','refund_with_inventory_return','refund_with_loss');
CREATE TYPE public.void_event_type AS ENUM ('void_pre_redeem','refund_post_redeem');
CREATE TYPE public.void_inventory_resolution AS ENUM ('none','returned_to_stock','recognized_as_loss');

-- void_requests table
CREATE TABLE public.void_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  request_type public.void_request_type NOT NULL DEFAULT 'unknown',
  reason text NOT NULL,
  notes text,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status public.void_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  execution_mode public.void_execution_mode,
  executed_at timestamptz
);

-- void_events table
CREATE TABLE public.void_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  void_request_id uuid NOT NULL REFERENCES public.void_requests(id),
  event_type public.void_event_type NOT NULL,
  inventory_resolution public.void_inventory_resolution NOT NULL DEFAULT 'none',
  reason text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_void_requests_venue_status ON public.void_requests(venue_id, status);
CREATE INDEX idx_void_requests_sale ON public.void_requests(sale_id);
CREATE INDEX idx_void_events_request ON public.void_events(void_request_id);
CREATE INDEX idx_void_events_sale ON public.void_events(sale_id);

-- RLS
ALTER TABLE public.void_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.void_events ENABLE ROW LEVEL SECURITY;

-- Policies: read by venue for authenticated
CREATE POLICY "Users can read void_requests for their venue"
  ON public.void_requests FOR SELECT TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Users can read void_events for their venue"
  ON public.void_events FOR SELECT TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.user_roles WHERE user_id = auth.uid()));

-- Insert policy for void_requests (cashiers can create requests)
CREATE POLICY "Authenticated users can insert void_requests"
  ON public.void_requests FOR INSERT TO authenticated
  WITH CHECK (venue_id IN (SELECT venue_id FROM public.user_roles WHERE user_id = auth.uid()) AND requested_by = auth.uid());

-- Update policy for void_requests (admin/gerencia can review)
CREATE POLICY "Admin can update void_requests"
  ON public.void_requests FOR UPDATE TO authenticated
  USING (venue_id IN (SELECT venue_id FROM public.user_roles WHERE user_id = auth.uid()));

-- Insert policy for void_events (system creates via RPCs)
CREATE POLICY "Authenticated users can insert void_events"
  ON public.void_events FOR INSERT TO authenticated
  WITH CHECK (venue_id IN (SELECT venue_id FROM public.user_roles WHERE user_id = auth.uid()));
