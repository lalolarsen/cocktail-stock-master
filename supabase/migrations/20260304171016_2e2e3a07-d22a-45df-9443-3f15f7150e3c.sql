
CREATE TABLE IF NOT EXISTS public.passline_audit_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  jornada_id      uuid REFERENCES public.jornadas(id) ON DELETE SET NULL,
  totem_number    text NOT NULL,
  report_number   text NOT NULL,
  session_date    date NOT NULL DEFAULT CURRENT_DATE,
  period_start    timestamptz,
  period_end      timestamptz,
  total_amount    integer NOT NULL DEFAULT 0,
  total_txns      integer NOT NULL DEFAULT 0,
  payment_debito  integer NOT NULL DEFAULT 0,
  payment_visa    integer NOT NULL DEFAULT 0,
  payment_amex    integer NOT NULL DEFAULT 0,
  payment_diners  integer NOT NULL DEFAULT 0,
  payment_mastercard integer NOT NULL DEFAULT 0,
  payment_otras   integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'reconciled', 'discrepancy')),
  notes           text,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, totem_number, report_number)
);

CREATE TABLE IF NOT EXISTS public.passline_audit_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.passline_audit_sessions(id) ON DELETE CASCADE,
  venue_id        uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  product_name    text NOT NULL,
  quantity        integer NOT NULL DEFAULT 1,
  unit_price      integer NOT NULL DEFAULT 0,
  total_amount    integer NOT NULL DEFAULT 0,
  cocktail_id     uuid REFERENCES public.cocktails(id) ON DELETE SET NULL,
  stock_applied   boolean NOT NULL DEFAULT false,
  income_applied  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS passline_audit_sessions_venue_idx
  ON public.passline_audit_sessions(venue_id);
CREATE INDEX IF NOT EXISTS passline_audit_sessions_jornada_idx
  ON public.passline_audit_sessions(jornada_id);
CREATE INDEX IF NOT EXISTS passline_audit_items_session_idx
  ON public.passline_audit_items(session_id);
CREATE INDEX IF NOT EXISTS passline_audit_items_cocktail_idx
  ON public.passline_audit_items(cocktail_id);

ALTER TABLE public.passline_audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passline_audit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passline_sessions_venue_access" ON public.passline_audit_sessions
  FOR ALL USING (
    auth.role() = 'authenticated'
    AND venue_id IN (
      SELECT venue_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT id FROM public.venues WHERE id = venue_id
    )
  );

CREATE POLICY "passline_items_venue_access" ON public.passline_audit_items
  FOR ALL USING (
    auth.role() = 'authenticated'
    AND venue_id IN (
      SELECT venue_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT id FROM public.venues WHERE id = venue_id
    )
  );

CREATE OR REPLACE FUNCTION public.update_passline_session_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER passline_session_updated_at
  BEFORE UPDATE ON public.passline_audit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_passline_session_updated_at();
