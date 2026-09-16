-- Guardarropía: tickets y tarifa
CREATE TABLE public.coatcheck_settings (
  venue_id UUID PRIMARY KEY,
  price_per_garment INTEGER NOT NULL DEFAULT 2000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.coatcheck_settings TO authenticated;
GRANT ALL ON public.coatcheck_settings TO service_role;

ALTER TABLE public.coatcheck_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coatcheck_settings_select" ON public.coatcheck_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "coatcheck_settings_upsert" ON public.coatcheck_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "coatcheck_settings_update" ON public.coatcheck_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.coatcheck_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  jornada_id UUID REFERENCES public.jornadas(id) ON DELETE SET NULL,
  ticket_number INTEGER NOT NULL,
  garment_count INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'issued',
  note TEXT,
  issued_by UUID,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retrieved_by UUID,
  retrieved_at TIMESTAMPTZ,
  CONSTRAINT coatcheck_status_chk CHECK (status IN ('issued','retrieved','cancelled')),
  CONSTRAINT coatcheck_payment_chk CHECK (payment_method IN ('cash','debit','credit','card','transfer'))
);

CREATE UNIQUE INDEX coatcheck_tickets_jornada_number_uq
  ON public.coatcheck_tickets (jornada_id, ticket_number);
CREATE INDEX coatcheck_tickets_venue_issued_idx
  ON public.coatcheck_tickets (venue_id, issued_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.coatcheck_tickets TO authenticated;
GRANT ALL ON public.coatcheck_tickets TO service_role;

ALTER TABLE public.coatcheck_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coatcheck_tickets_select" ON public.coatcheck_tickets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "coatcheck_tickets_insert" ON public.coatcheck_tickets
  FOR INSERT TO authenticated WITH CHECK (issued_by = auth.uid());

CREATE POLICY "coatcheck_tickets_update" ON public.coatcheck_tickets
  FOR UPDATE TO authenticated USING (true);

-- Emisión atómica con correlativo por jornada
CREATE OR REPLACE FUNCTION public.issue_coatcheck_ticket(
  _venue_id UUID,
  _jornada_id UUID,
  _garment_count INTEGER,
  _unit_price INTEGER,
  _payment_method TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS public.coatcheck_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next INTEGER;
  _row public.coatcheck_tickets;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF _garment_count IS NULL OR _garment_count < 1 THEN
    RAISE EXCEPTION 'Cantidad de prendas inválida';
  END IF;

  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO _next
  FROM public.coatcheck_tickets
  WHERE jornada_id IS NOT DISTINCT FROM _jornada_id;

  INSERT INTO public.coatcheck_tickets (
    venue_id, jornada_id, ticket_number, garment_count,
    unit_price, amount, payment_method, note, issued_by
  ) VALUES (
    _venue_id, _jornada_id, _next, _garment_count,
    COALESCE(_unit_price, 0), COALESCE(_unit_price, 0) * _garment_count,
    COALESCE(_payment_method, 'cash'), _note, auth.uid()
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_coatcheck_ticket(UUID, UUID, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;