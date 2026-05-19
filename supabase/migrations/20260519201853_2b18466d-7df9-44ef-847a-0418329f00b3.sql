
-- 1) Rebuild dispatch_jornada_closed_email with correct recipient query and payload field names
CREATE OR REPLACE FUNCTION public.dispatch_jornada_closed_email(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada RECORD;
  v_venue_name text;
  v_recipient RECORD;
  v_total_gross numeric := 0;
  v_total_net numeric := 0;
  v_commission numeric := 0;
  v_pos_breakdown jsonb := '[]'::jsonb;
  v_courtesies jsonb := '[]'::jsonb;
  v_supabase_url text;
  v_service_role_key text;
  v_payload jsonb;
  v_jornada_label text;
  v_observacion text;
  v_closed_by_id uuid;
  v_closed_by_name text;
  v_opened_at timestamptz;
  v_closed_at timestamptz;
BEGIN
  SELECT j.*, v.name AS venue_name
  INTO v_jornada
  FROM jornadas j
  LEFT JOIN venues v ON v.id = j.venue_id
  WHERE j.id = p_jornada_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_venue_name := COALESCE(v_jornada.venue_name, 'Local');
  v_jornada_label := COALESCE(
    NULLIF(trim(v_jornada.nombre), ''),
    'Jornada N°' || COALESCE(v_jornada.numero_jornada::text, '?') || ' · ' ||
      to_char(v_jornada.fecha, 'YYYY-MM-DD')
  );
  v_observacion := COALESCE(v_jornada.observacion_cierre, NULL);

  v_opened_at := (v_jornada.fecha + COALESCE(v_jornada.hora_apertura, '00:00'::time))
                 AT TIME ZONE 'America/Santiago';
  v_closed_at := CASE
    WHEN v_jornada.hora_cierre IS NOT NULL THEN
      (v_jornada.fecha + v_jornada.hora_cierre) AT TIME ZONE 'America/Santiago'
    ELSE NULL
  END;

  v_closed_by_id := COALESCE(v_jornada.forced_by_user_id, v_jornada.closed_by_user_id);
  IF v_closed_by_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Sistema')
    INTO v_closed_by_name
    FROM profiles p
    WHERE p.id = v_closed_by_id
    LIMIT 1;
  END IF;
  v_closed_by_name := COALESCE(v_closed_by_name, 'Sistema');

  -- Totals
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_gross
  FROM sales WHERE jornada_id = p_jornada_id AND is_cancelled = false;

  v_total_gross := v_total_gross + COALESCE((
    SELECT SUM(total) FROM ticket_sales
    WHERE jornada_id = p_jornada_id AND payment_status = 'paid'
  ), 0);

  v_commission := round(v_total_gross * 0.01);
  v_total_net := v_total_gross - v_commission;

  -- POS breakdown
  BEGIN
    WITH alc AS (
      SELECT
        COALESCE(pl.name, 'Sin POS') AS pos_name,
        SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END) AS cash,
        COUNT(*) FILTER (WHERE s.payment_method = 'cash') AS cash_count,
        SUM(CASE WHEN s.payment_method = 'card' THEN s.total_amount ELSE 0 END) AS card,
        COUNT(*) FILTER (WHERE s.payment_method = 'card') AS card_count,
        SUM(CASE WHEN s.payment_method NOT IN ('cash','card') THEN s.total_amount ELSE 0 END) AS other,
        COUNT(*) FILTER (WHERE s.payment_method NOT IN ('cash','card')) AS other_count,
        SUM(s.total_amount) AS total,
        COUNT(*) AS tx
      FROM sales s
      LEFT JOIN pos_locations pl ON pl.id = s.pos_location_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY COALESCE(pl.name, 'Sin POS')
    ),
    tk AS (
      SELECT
        COALESCE(pl.name, 'Sin POS') AS pos_name,
        SUM(CASE WHEN ts.payment_method = 'cash' THEN ts.total ELSE 0 END) AS cash,
        COUNT(*) FILTER (WHERE ts.payment_method = 'cash') AS cash_count,
        SUM(CASE WHEN ts.payment_method = 'card' THEN ts.total ELSE 0 END) AS card,
        COUNT(*) FILTER (WHERE ts.payment_method = 'card') AS card_count,
        SUM(CASE WHEN ts.payment_method NOT IN ('cash','card') THEN ts.total ELSE 0 END) AS other,
        COUNT(*) FILTER (WHERE ts.payment_method NOT IN ('cash','card')) AS other_count,
        SUM(ts.total) AS total,
        COUNT(*) AS tx
      FROM ticket_sales ts
      LEFT JOIN pos_locations pl ON pl.id = ts.pos_id
      WHERE ts.jornada_id = p_jornada_id AND ts.payment_status = 'paid'
      GROUP BY COALESCE(pl.name, 'Sin POS')
    ),
    merged AS (
      SELECT pos_name FROM alc UNION SELECT pos_name FROM tk
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'pos_name', m.pos_name,
      'alcohol', jsonb_build_object(
        'cash', COALESCE(a.cash,0), 'cash_count', COALESCE(a.cash_count,0),
        'card', COALESCE(a.card,0), 'card_count', COALESCE(a.card_count,0),
        'other', COALESCE(a.other,0), 'other_count', COALESCE(a.other_count,0),
        'total', COALESCE(a.total,0), 'tx', COALESCE(a.tx,0)
      ),
      'tickets', CASE WHEN t.pos_name IS NULL THEN NULL ELSE jsonb_build_object(
        'cash', COALESCE(t.cash,0), 'cash_count', COALESCE(t.cash_count,0),
        'card', COALESCE(t.card,0), 'card_count', COALESCE(t.card_count,0),
        'other', COALESCE(t.other,0), 'other_count', COALESCE(t.other_count,0),
        'total', COALESCE(t.total,0), 'tx', COALESCE(t.tx,0)
      ) END,
      'total', COALESCE(a.total,0) + COALESCE(t.total,0),
      'tx', COALESCE(a.tx,0) + COALESCE(t.tx,0)
    ) ORDER BY (COALESCE(a.total,0) + COALESCE(t.total,0)) DESC), '[]'::jsonb)
    INTO v_pos_breakdown
    FROM merged m
    LEFT JOIN alc a ON a.pos_name = m.pos_name
    LEFT JOIN tk  t ON t.pos_name = m.pos_name;
  EXCEPTION WHEN OTHERS THEN v_pos_breakdown := '[]'::jsonb;
  END;

  -- Courtesies
  BEGIN
    WITH q AS (
      SELECT cq.id, cq.created_by, cq.max_uses, cq.used_count
      FROM courtesy_qr cq
      WHERE cq.venue_id = v_jornada.venue_id
        AND cq.created_at >= v_opened_at
        AND cq.created_at <= COALESCE(v_closed_at, now())
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'issuer_name', issuer_name,
      'qr_count', qr_count,
      'total_uses', total_uses,
      'redeemed_count', redeemed_count
    ) ORDER BY qr_count DESC), '[]'::jsonb)
    INTO v_courtesies
    FROM (
      SELECT
        COALESCE(NULLIF(trim(p.full_name), ''), 'Desconocido') AS issuer_name,
        COUNT(*) AS qr_count,
        COALESCE(SUM(q.max_uses), 0) AS total_uses,
        COALESCE(SUM(q.used_count), 0) AS redeemed_count
      FROM q
      LEFT JOIN profiles p ON p.id = q.created_by
      GROUP BY COALESCE(NULLIF(trim(p.full_name), ''), 'Desconocido')
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_courtesies := '[]'::jsonb;
  END;

  -- Resolve URL + service key
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  END IF;
  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE WARNING 'dispatch_jornada_closed_email: missing supabase_url or service_role_key';
    RETURN;
  END IF;

  -- Recipients: admin/gerencia workers + external enabled emails for this venue
  FOR v_recipient IN
    SELECT DISTINCT lower(email) AS email, name FROM (
      SELECT
        p.notification_email AS email,
        COALESCE(NULLIF(trim(p.full_name), ''), p.notification_email) AS name
      FROM profiles p
      JOIN worker_roles wr ON wr.worker_id = p.id
      LEFT JOIN notification_preferences np
        ON np.worker_id = p.id
       AND np.event_type = 'jornada_closed'
       AND np.channel = 'email'
      WHERE wr.role IN ('admin','gerencia')
        AND COALESCE(p.is_active, true) = true
        AND p.notification_email IS NOT NULL
        AND trim(p.notification_email) <> ''
        AND COALESCE(np.is_enabled, true) = true
      UNION
      SELECT jne.email, COALESCE(jne.label, jne.email) AS name
      FROM jornada_notification_emails jne
      WHERE jne.venue_id = v_jornada.venue_id
        AND jne.is_enabled = true
    ) all_recipients
    WHERE email IS NOT NULL AND email <> ''
  LOOP
    v_payload := jsonb_build_object(
      'templateName', 'jornada-closed-summary',
      'recipientEmail', v_recipient.email,
      'idempotencyKey', 'jornada-' || p_jornada_id::text || '-' || v_recipient.email,
      'templateData', jsonb_build_object(
        'recipient_name', v_recipient.name,
        'venue_name', v_venue_name,
        'jornada_label', v_jornada_label,
        'opened_at', v_opened_at,
        'closed_at', v_closed_at,
        'closed_by', v_closed_by_name,
        'forced_close', COALESCE(v_jornada.forced_close, false),
        'forced_reason', v_jornada.forced_reason,
        'observacion_cierre', v_observacion,
        'total_gross', v_total_gross,
        'stockia_commission', v_commission,
        'total_net', v_total_net,
        'pos_breakdown', v_pos_breakdown,
        'courtesies_issued', v_courtesies
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
$function$;

GRANT EXECUTE ON FUNCTION public.dispatch_jornada_closed_email(uuid) TO authenticated, service_role;

-- 2) Hook dispatch into close_jornada_with_summary
CREATE OR REPLACE FUNCTION public.close_jornada_with_summary(p_jornada_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada record;
  v_user_id uuid;
  v_ingresos_brutos integer := 0;
  v_costo_ventas integer := 0;
  v_gastos_operacionales integer := 0;
  v_utilidad_bruta integer;
  v_margen_bruto numeric(5,2);
  v_resultado_periodo integer;
  v_summary_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'gerencia'::app_role)) THEN
    RETURN json_build_object('success', false, 'error', 'Sin permisos para cerrar jornada');
  END IF;

  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF v_jornada IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Jornada no encontrada');
  END IF;
  IF v_jornada.estado != 'activa' THEN
    RETURN json_build_object('success', false, 'error', 'La jornada no está activa');
  END IF;
  IF EXISTS (SELECT 1 FROM jornada_financial_summary WHERE jornada_id = p_jornada_id) THEN
    RETURN json_build_object('success', false, 'error', 'La jornada ya tiene un resumen financiero');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_ingresos_brutos
  FROM gross_income_entries WHERE jornada_id = p_jornada_id;

  SELECT COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0)::integer INTO v_costo_ventas
  FROM stock_movements WHERE jornada_id = p_jornada_id AND movement_type = 'salida';

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_gastos_operacionales
  FROM expenses WHERE jornada_id = p_jornada_id;

  v_utilidad_bruta := v_ingresos_brutos - v_costo_ventas;
  v_margen_bruto := CASE WHEN v_ingresos_brutos > 0
    THEN ROUND((v_utilidad_bruta::numeric / v_ingresos_brutos::numeric) * 100, 2)
    ELSE 0 END;
  v_resultado_periodo := v_utilidad_bruta - v_gastos_operacionales;

  INSERT INTO jornada_financial_summary (
    jornada_id, venue_id, ingresos_brutos, costo_ventas, utilidad_bruta,
    margen_bruto, gastos_operacionales, resultado_periodo, closed_by
  ) VALUES (
    p_jornada_id, v_jornada.venue_id, v_ingresos_brutos, v_costo_ventas, v_utilidad_bruta,
    v_margen_bruto, v_gastos_operacionales, v_resultado_periodo, v_user_id
  ) RETURNING id INTO v_summary_id;

  UPDATE jornadas SET estado='cerrada', hora_cierre=NOW()::time, updated_at=NOW()
  WHERE id = p_jornada_id;

  -- Fire-and-forget email dispatch
  BEGIN
    PERFORM public.dispatch_jornada_closed_email(p_jornada_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_jornada_closed_email failed: %', SQLERRM;
  END;

  RETURN json_build_object(
    'success', true,
    'summary_id', v_summary_id,
    'ingresos_brutos', v_ingresos_brutos,
    'costo_ventas', v_costo_ventas,
    'utilidad_bruta', v_utilidad_bruta,
    'margen_bruto', v_margen_bruto,
    'gastos_operacionales', v_gastos_operacionales,
    'resultado_periodo', v_resultado_periodo
  );
END;
$function$;

-- 3) Hook dispatch into force_close_jornada (append PERFORM at the end)
DO $$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname='force_close_jornada' LIMIT 1;
  IF v_src IS NULL OR v_src LIKE '%dispatch_jornada_closed_email%' THEN
    -- already wired or doesn't exist
    RETURN;
  END IF;
END $$;

-- Wrap force_close: define a trigger on jornadas to dispatch on transition to cerrada
CREATE OR REPLACE FUNCTION public.tg_dispatch_jornada_closed_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado = 'cerrada' AND (OLD.estado IS DISTINCT FROM 'cerrada') THEN
    BEGIN
      PERFORM public.dispatch_jornada_closed_email(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'tg_dispatch_jornada_closed_email failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dispatch_jornada_closed_email ON public.jornadas;
CREATE TRIGGER trg_dispatch_jornada_closed_email
AFTER UPDATE OF estado ON public.jornadas
FOR EACH ROW
EXECUTE FUNCTION public.tg_dispatch_jornada_closed_email();
