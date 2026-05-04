
CREATE TABLE IF NOT EXISTS public.jornada_notification_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  email text NOT NULL,
  label text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jornada_notification_emails_venue_email_unique UNIQUE (venue_id, email),
  CONSTRAINT jornada_notification_emails_email_format CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

CREATE INDEX IF NOT EXISTS idx_jornada_notification_emails_venue
  ON public.jornada_notification_emails(venue_id) WHERE is_enabled;

ALTER TABLE public.jornada_notification_emails ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_jornada_notification_emails_updated_at ON public.jornada_notification_emails;
CREATE TRIGGER trg_jornada_notification_emails_updated_at
  BEFORE UPDATE ON public.jornada_notification_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admin/Gerencia ven destinatarios" ON public.jornada_notification_emails;
CREATE POLICY "Admin/Gerencia ven destinatarios"
  ON public.jornada_notification_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','gerencia','developer')
    )
  );

DROP POLICY IF EXISTS "Admin/Gerencia gestionan destinatarios" ON public.jornada_notification_emails;
CREATE POLICY "Admin/Gerencia gestionan destinatarios"
  ON public.jornada_notification_emails FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','gerencia','developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','gerencia','developer')
    )
  );

-- Reemplazar dispatch para incluir destinatarios externos del venue
CREATE OR REPLACE FUNCTION public.dispatch_jornada_closed_email(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jornada RECORD;
  v_venue_name text;
  v_recipient RECORD;
  v_total_gross numeric := 0;
  v_total_net numeric := 0;
  v_commission numeric := 0;
  v_cogs numeric := 0;
  v_courtesies_count int := 0;
  v_courtesies_cost numeric := 0;
  v_qr_redeemed int := 0;
  v_qr_pending int := 0;
  v_pos_breakdown jsonb := '[]'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
  v_supabase_url text;
  v_service_role_key text;
  v_payload jsonb;
  v_jornada_label text;
  v_observacion text;
BEGIN
  SELECT j.*, v.name AS venue_name
  INTO v_jornada
  FROM jornadas j
  LEFT JOIN venues v ON v.id = j.venue_id
  WHERE j.id = p_jornada_id;

  IF NOT FOUND THEN RETURN; END IF;
  v_venue_name := COALESCE(v_jornada.venue_name, 'Local');
  v_jornada_label := COALESCE(v_jornada.nombre, 'Jornada ' || to_char((v_jornada.fecha_apertura AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD'));
  v_observacion := COALESCE(v_jornada.observacion_cierre, NULL);

  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_gross
  FROM sales WHERE jornada_id = p_jornada_id AND is_cancelled = false;

  v_total_gross := v_total_gross + COALESCE((
    SELECT SUM(total) FROM ticket_sales
    WHERE jornada_id = p_jornada_id AND payment_status = 'paid'
  ), 0);

  v_commission := round(v_total_gross * 0.01);
  v_total_net := v_total_gross - v_commission;

  BEGIN
    SELECT COALESCE(SUM(si.quantity * COALESCE(p.average_cost, 0)), 0)
    INTO v_cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false;
  EXCEPTION WHEN OTHERS THEN v_cogs := 0;
  END;

  SELECT COUNT(*), COALESCE(SUM(
    (SELECT COALESCE(SUM(si.quantity * COALESCE(p.average_cost, 0)), 0)
     FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = s.id)
  ), 0)
  INTO v_courtesies_count, v_courtesies_cost
  FROM sales s
  WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false AND s.total_amount = 0;

  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE redeemed_at IS NOT NULL),
      COUNT(*) FILTER (WHERE redeemed_at IS NULL)
    INTO v_qr_redeemed, v_qr_pending
    FROM pickup_tokens
    WHERE jornada_id = p_jornada_id;
  EXCEPTION WHEN OTHERS THEN
    v_qr_redeemed := 0; v_qr_pending := 0;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'pos_name', pos_name,
      'cash_total', cash_total,
      'card_total', card_total,
      'transactions', transactions
    ) ORDER BY (cash_total + card_total) DESC), '[]'::jsonb)
    INTO v_pos_breakdown
    FROM (
      SELECT
        COALESCE(pl.name, 'Sin POS') AS pos_name,
        SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END) AS cash_total,
        SUM(CASE WHEN s.payment_method <> 'cash' THEN s.total_amount ELSE 0 END) AS card_total,
        COUNT(*) AS transactions
      FROM sales s
      LEFT JOIN pos_locations pl ON pl.id = s.pos_location_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY pl.name
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_pos_breakdown := '[]'::jsonb;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', product_name,
      'quantity', quantity,
      'revenue', revenue
    ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO v_top_products
    FROM (
      SELECT
        COALESCE(p.name, si.name, 'Producto') AS product_name,
        SUM(si.quantity) AS quantity,
        SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY COALESCE(p.name, si.name, 'Producto')
      ORDER BY SUM(si.subtotal) DESC
      LIMIT 10
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_top_products := '[]'::jsonb;
  END;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  END IF;
  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE WARNING 'dispatch_jornada_closed_email: missing supabase_url or service_role_key';
    RETURN;
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT email, name FROM (
      SELECT
        COALESCE(p.notification_email, u.email) AS email,
        COALESCE(p.full_name, u.email) AS name
      FROM user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
      LEFT JOIN profiles p ON p.user_id = ur.user_id
      WHERE ur.role IN ('admin', 'gerencia')
        AND COALESCE(p.notification_email, u.email) IS NOT NULL
      UNION
      SELECT
        jne.email,
        COALESCE(jne.label, jne.email) AS name
      FROM jornada_notification_emails jne
      WHERE jne.venue_id = v_jornada.venue_id
        AND jne.is_enabled = true
    ) all_recipients
  LOOP
    v_payload := jsonb_build_object(
      'template_name', 'jornada-closed-summary',
      'to', v_recipient.email,
      'purpose', 'transactional',
      'idempotency_key', 'jornada-' || p_jornada_id::text || '-' || v_recipient.email,
      'data', jsonb_build_object(
        'recipient_name', v_recipient.name,
        'venue_name', v_venue_name,
        'jornada_label', v_jornada_label,
        'fecha_apertura', v_jornada.fecha_apertura,
        'fecha_cierre', v_jornada.fecha_cierre,
        'observacion_cierre', v_observacion,
        'total_gross', v_total_gross,
        'total_net', v_total_net,
        'stockia_commission', v_commission,
        'cogs', v_cogs,
        'courtesies_count', v_courtesies_count,
        'courtesies_cost', v_courtesies_cost,
        'qr_redeemed', v_qr_redeemed,
        'qr_pending', v_qr_pending,
        'pos_breakdown', v_pos_breakdown,
        'top_products', v_top_products
      )
    );

    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-transactional-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to enqueue email for %: %', v_recipient.email, SQLERRM;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_jornada_closed_email(uuid) TO authenticated, service_role;
