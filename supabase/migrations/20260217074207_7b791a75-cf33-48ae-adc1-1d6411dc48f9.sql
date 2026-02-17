
-- Table: courtesy_qr
CREATE TABLE public.courtesy_qr (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE DEFAULT substr(encode(uuid_send(gen_random_uuid()), 'hex'), 1, 12),
  product_id uuid NOT NULL REFERENCES public.cocktails(id),
  product_name text NOT NULL DEFAULT '',
  qty integer NOT NULL DEFAULT 1,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  note text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL REFERENCES public.venues(id)
);

-- Index for fast lookups
CREATE INDEX idx_courtesy_qr_code ON public.courtesy_qr(code);
CREATE INDEX idx_courtesy_qr_venue_status ON public.courtesy_qr(venue_id, status);

-- Enable RLS
ALTER TABLE public.courtesy_qr ENABLE ROW LEVEL SECURITY;

-- Admin & Gerencia can manage courtesy QRs for their venue
CREATE POLICY "Admin can manage courtesy_qr" ON public.courtesy_qr
  FOR ALL USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can manage courtesy_qr" ON public.courtesy_qr
  FOR ALL USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'gerencia'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'gerencia'::app_role));

-- Vendedores can read courtesy QRs (for redemption validation)
CREATE POLICY "Vendedores can view courtesy_qr" ON public.courtesy_qr
  FOR SELECT USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'::app_role));

-- Vendedores can update used_count/status on redemption
CREATE POLICY "Vendedores can update courtesy_qr on redeem" ON public.courtesy_qr
  FOR UPDATE USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'::app_role))
  WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'::app_role));

-- Table: courtesy_redemptions
CREATE TABLE public.courtesy_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courtesy_id uuid NOT NULL REFERENCES public.courtesy_qr(id),
  redeemed_by uuid NOT NULL,
  redeemed_at timestamp with time zone NOT NULL DEFAULT now(),
  pos_id uuid REFERENCES public.pos_terminals(id),
  jornada_id uuid NOT NULL REFERENCES public.jornadas(id),
  sale_id uuid REFERENCES public.sales(id),
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'fail')),
  reason text,
  venue_id uuid NOT NULL REFERENCES public.venues(id)
);

CREATE INDEX idx_courtesy_redemptions_courtesy ON public.courtesy_redemptions(courtesy_id);

-- Enable RLS
ALTER TABLE public.courtesy_redemptions ENABLE ROW LEVEL SECURITY;

-- Admin & Gerencia can view redemptions
CREATE POLICY "Admin can manage courtesy_redemptions" ON public.courtesy_redemptions
  FOR ALL USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerencia can view courtesy_redemptions" ON public.courtesy_redemptions
  FOR SELECT USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'gerencia'::app_role));

-- Vendedores can insert redemptions (on successful redeem)
CREATE POLICY "Vendedores can insert courtesy_redemptions" ON public.courtesy_redemptions
  FOR INSERT WITH CHECK (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'::app_role));

CREATE POLICY "Vendedores can view courtesy_redemptions" ON public.courtesy_redemptions
  FOR SELECT USING (venue_id = get_user_venue_id() AND has_role(auth.uid(), 'vendedor'::app_role));
