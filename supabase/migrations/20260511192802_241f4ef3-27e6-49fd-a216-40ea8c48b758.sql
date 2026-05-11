-- 1) Add closed_by_user_id column
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS closed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Update close_jornada_manual to record closed_by_user_id
CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id uuid,
  p_cash_closings jsonb DEFAULT '[]'::jsonb,
  p_observacion text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada RECORD;
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_closing RECORD;
  v_opening_cash numeric;
  v_cash_sales_alcohol numeric;
  v_cash_sales_tickets numeric;
  v_cash_sales numeric;
  v_cash_expenses numeric;
  v_expected numeric;
  v_counted numeric;
  v_difference numeric;
  v_now_santiago timestamptz := now();
  v_hora_cierre time;
  v_observacion text;
BEGIN
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada', 'failing_step', 'jornada_exists');
  END IF;
  IF v_jornada.estado <> 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está activa (estado: ' || v_jornada.estado || ')', 'failing_step', 'jornada_active');
  END IF;

  v_venue_id := v_jornada.venue_id;
  v_observacion := NULLIF(trim(COALESCE(p_observacion, '')), '');

  IF p_cash_closings IS NOT NULL AND jsonb_typeof(p_cash_closings) = 'array' AND jsonb_array_length(p_cash_closings) > 0 THEN
    FOR v_closing IN
      SELECT (elem->>'pos_id')::uuid AS pos_id,
             COALESCE(trim(elem->>'bartender_name'), '') AS bartender_name,
             COALESCE(elem->>'notes', '') AS notes,
             NULLIF(elem->>'closing_cash_counted', '')::numeric AS closing_cash_counted
      FROM jsonb_array_elements(p_cash_closings) AS elem
      WHERE (elem->>'pos_id') IS NOT NULL
    LOOP
      SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
      FROM jornada_cash_openings
      WHERE jornada_id = p_jornada_id AND pos_id = v_closing.pos_id LIMIT 1;
      IF v_opening_cash IS NULL THEN v_opening_cash := 0; END IF;

      SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales_alcohol
      FROM sales
      WHERE jornada_id = p_jornada_id AND payment_method = 'cash' AND is_cancelled = false AND pos_id = v_closing.pos_id;

      SELECT COALESCE(SUM(total), 0) INTO v_cash_sales_tickets
      FROM ticket_sales
      WHERE jornada_id = p_jornada_id AND payment_method = 'cash' AND payment_status = 'paid' AND pos_id = v_closing.pos_id;

      v_cash_sales := COALESCE(v_cash_sales_alcohol, 0) + COALESCE(v_cash_sales_tickets, 0);

      SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
      FROM expenses
      WHERE jornada_id = p_jornada_id AND payment_method = 'cash' AND (pos_id = v_closing.pos_id OR pos_id IS NULL);

      v_expected := v_opening_cash + v_cash_sales - v_cash_expenses;
      v_counted := v_closing.closing_cash_counted;
      v_difference := CASE WHEN v_counted IS NULL THEN NULL ELSE (v_counted - v_expected) END;

      INSERT INTO jornada_cash_closings (
        jornada_id, pos_id, venue_id, created_by,
        opening_cash_amount, cash_sales_total, expected_cash,
        closing_cash_counted, difference, notes,
        bartender_name, physical_reconciliation_confirmed
      )
      VALUES (
        p_jornada_id, v_closing.pos_id, v_venue_id, v_user_id,
        v_opening_cash, v_cash_sales, v_expected,
        v_counted, v_difference, NULLIF(trim(v_closing.notes), ''),
        NULLIF(v_closing.bartender_name, ''), true
      )
      ON CONFLICT (jornada_id, pos_id) DO UPDATE SET
        opening_cash_amount = EXCLUDED.opening_cash_amount,
        cash_sales_total = EXCLUDED.cash_sales_total,
        expected_cash = EXCLUDED.expected_cash,
        closing_cash_counted = EXCLUDED.closing_cash_counted,
        difference = EXCLUDED.difference,
        notes = EXCLUDED.notes,
        bartender_name = COALESCE(EXCLUDED.bartender_name, jornada_cash_closings.bartender_name),
        physical_reconciliation_confirmed = true;
    END LOOP;
  END IF;

  v_hora_cierre := (v_now_santiago AT TIME ZONE 'America/Santiago')::time;
  UPDATE jornadas
     SET estado = 'cerrada',
         hora_cierre = v_hora_cierre,
         observacion_cierre = v_observacion,
         closed_by_user_id = v_user_id,
         updated_at = v_now_santiago
   WHERE id = p_jornada_id;

  INSERT INTO jornada_audit_log (jornada_id, venue_id, action, actor_user_id, actor_source, meta)
  VALUES (p_jornada_id, v_venue_id, 'closed', v_user_id, 'manual', jsonb_build_object(
    'cash_closings_count', COALESCE(jsonb_array_length(p_cash_closings), 0),
    'mode', 'simple_observation',
    'has_observacion', v_observacion IS NOT NULL
  ));

  BEGIN
    PERFORM public.dispatch_jornada_closed_email(p_jornada_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_jornada_closed_email failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 3) Rewrite dispatch_jornada_closed_email with new payload
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

  -- Compose timestamps from fecha + hora_*
  v_opened_at := (v_jornada.fecha + COALESCE(v_jornada.hora_apertura, '00:00'::time))
                 AT TIME ZONE 'America/Santiago';
  v_closed_at := CASE
    WHEN v_jornada.hora_cierre IS NOT NULL THEN
      (v_jornada.fecha + v_jornada.hora_cierre) AT TIME ZONE 'America/Santiago'
    ELSE NULL
  END;

  -- Closed-by: forced > manual closed_by > fallback
  v_closed_by_id := COALESCE(v_jornada.forced_by_user_id, v_jornada.closed_by_user_id);
  IF v_closed_by_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.full_name), ''), u.email, 'Sistema')
    INTO v_closed_by_name
    FROM auth.users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = v_closed_by_id
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

  -- POS breakdown (alcohol + tickets, by payment method)
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
      SELECT pos_name FROM alc
      UNION
      SELECT pos_name FROM tk
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

  -- Courtesies issued during the jornada window, grouped by issuer
  BEGIN
    WITH q AS (
      SELECT
        cq.id,
        cq.created_by,
        cq.max_uses,
        cq.used_count
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
        COALESCE(NULLIF(trim(p.full_name), ''), u.email, 'Desconocido') AS issuer_name,
        COUNT(*) AS qr_count,
        COALESCE(SUM(q.max_uses), 0) AS total_uses,
        COALESCE(SUM(q.used_count), 0) AS redeemed_count
      FROM q
      LEFT JOIN auth.users u ON u.id = q.created_by
      LEFT JOIN profiles p ON p.user_id = q.created_by
      GROUP BY COALESCE(NULLIF(trim(p.full_name), ''), u.email, 'Desconocido')
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
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_jornada_closed_email(uuid) TO authenticated, service_role;