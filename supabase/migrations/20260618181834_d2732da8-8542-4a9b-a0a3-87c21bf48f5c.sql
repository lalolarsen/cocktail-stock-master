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
  v_payment_summary jsonb := '{}'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
  v_waste_summary jsonb := '{}'::jsonb;
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
  SELECT j.*, v.name AS venue_name INTO v_jornada
  FROM jornadas j LEFT JOIN venues v ON v.id = j.venue_id
  WHERE j.id = p_jornada_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_venue_name := COALESCE(v_jornada.venue_name, 'Local');
  v_jornada_label := COALESCE(NULLIF(trim(v_jornada.nombre), ''),
    'Jornada N°' || COALESCE(v_jornada.numero_jornada::text, '?') || ' · ' ||
      to_char(v_jornada.fecha, 'YYYY-MM-DD'));
  v_observacion := COALESCE(v_jornada.observacion_cierre, NULL);
  v_opened_at := (v_jornada.fecha + COALESCE(v_jornada.hora_apertura, '00:00'::time)) AT TIME ZONE 'America/Santiago';
  v_closed_at := CASE WHEN v_jornada.hora_cierre IS NOT NULL
    THEN (v_jornada.fecha + v_jornada.hora_cierre) AT TIME ZONE 'America/Santiago' ELSE NULL END;

  v_closed_by_id := COALESCE(v_jornada.forced_by_user_id, v_jornada.closed_by_user_id);
  IF v_closed_by_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Sistema') INTO v_closed_by_name
    FROM profiles p WHERE p.id = v_closed_by_id LIMIT 1;
  END IF;
  v_closed_by_name := COALESCE(v_closed_by_name, 'Sistema');

  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_gross
  FROM sales WHERE jornada_id = p_jornada_id AND is_cancelled = false;
  v_total_gross := v_total_gross + COALESCE((
    SELECT SUM(total) FROM ticket_sales WHERE jornada_id = p_jornada_id AND payment_status = 'paid'
  ), 0);
  v_commission := round(v_total_gross * 0.01);
  v_total_net := v_total_gross - v_commission;

  BEGIN
    WITH combined AS (
      SELECT payment_method, total_amount::numeric AS amount
      FROM sales WHERE jornada_id = p_jornada_id AND is_cancelled = false
      UNION ALL
      SELECT payment_method, total::numeric AS amount
      FROM ticket_sales WHERE jornada_id = p_jornada_id AND payment_status = 'paid'
    )
    SELECT jsonb_build_object(
      'cash',           COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'), 0),
      'cash_count',     COALESCE(COUNT(*)    FILTER (WHERE payment_method = 'cash'), 0),
      'card',           COALESCE(SUM(amount) FILTER (WHERE payment_method = 'card'), 0),
      'card_count',     COALESCE(COUNT(*)    FILTER (WHERE payment_method = 'card'), 0),
      'transfer',       COALESCE(SUM(amount) FILTER (WHERE payment_method = 'transfer'), 0),
      'transfer_count', COALESCE(COUNT(*)    FILTER (WHERE payment_method = 'transfer'), 0),
      'other',          COALESCE(SUM(amount) FILTER (WHERE payment_method NOT IN ('cash','card','transfer')), 0),
      'other_count',    COALESCE(COUNT(*)    FILTER (WHERE payment_method NOT IN ('cash','card','transfer')), 0),
      'total', COALESCE(SUM(amount), 0),
      'tx', COALESCE(COUNT(*), 0)
    ) INTO v_payment_summary FROM combined;
  EXCEPTION WHEN OTHERS THEN v_payment_summary := '{}'::jsonb;
  END;

  BEGIN
    WITH alc AS (
      SELECT COALESCE(pl.name, 'Sin POS') AS pos_name,
        SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END) AS cash,
        COUNT(*) FILTER (WHERE s.payment_method = 'cash') AS cash_count,
        SUM(CASE WHEN s.payment_method = 'card' THEN s.total_amount ELSE 0 END) AS card,
        COUNT(*) FILTER (WHERE s.payment_method = 'card') AS card_count,
        SUM(CASE WHEN s.payment_method NOT IN ('cash','card') THEN s.total_amount ELSE 0 END) AS other,
        COUNT(*) FILTER (WHERE s.payment_method NOT IN ('cash','card')) AS other_count,
        SUM(s.total_amount) AS total, COUNT(*) AS tx
      FROM sales s LEFT JOIN pos_locations pl ON pl.id = s.pos_location_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY COALESCE(pl.name, 'Sin POS')
    ),
    tk AS (
      SELECT COALESCE(pl.name, 'Sin POS') AS pos_name,
        SUM(CASE WHEN ts.payment_method = 'cash' THEN ts.total ELSE 0 END) AS cash,
        COUNT(*) FILTER (WHERE ts.payment_method = 'cash') AS cash_count,
        SUM(CASE WHEN ts.payment_method = 'card' THEN ts.total ELSE 0 END) AS card,
        COUNT(*) FILTER (WHERE ts.payment_method = 'card') AS card_count,
        SUM(CASE WHEN ts.payment_method NOT IN ('cash','card') THEN ts.total ELSE 0 END) AS other,
        COUNT(*) FILTER (WHERE ts.payment_method NOT IN ('cash','card')) AS other_count,
        SUM(ts.total) AS total, COUNT(*) AS tx
      FROM ticket_sales ts LEFT JOIN pos_locations pl ON pl.id = ts.pos_id
      WHERE ts.jornada_id = p_jornada_id AND ts.payment_status = 'paid'
      GROUP BY COALESCE(pl.name, 'Sin POS')
    ),
    merged AS (SELECT pos_name FROM alc UNION SELECT pos_name FROM tk)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'pos_name', m.pos_name,
      'alcohol', jsonb_build_object(
        'cash', COALESCE(a.cash,0), 'cash_count', COALESCE(a.cash_count,0),
        'card', COALESCE(a.card,0), 'card_count', COALESCE(a.card_count,0),
        'other', COALESCE(a.other,0), 'other_count', COALESCE(a.other_count,0),
        'total', COALESCE(a.total,0), 'tx', COALESCE(a.tx,0)),
      'tickets', CASE WHEN t.pos_name IS NULL THEN NULL ELSE jsonb_build_object(
        'cash', COALESCE(t.cash,0), 'cash_count', COALESCE(t.cash_count,0),
        'card', COALESCE(t.card,0), 'card_count', COALESCE(t.card_count,0),
        'other', COALESCE(t.other,0), 'other_count', COALESCE(t.other_count,0),
        'total', COALESCE(t.total,0), 'tx', COALESCE(t.tx,0)) END,
      'total', COALESCE(a.total,0) + COALESCE(t.total,0),
      'tx', COALESCE(a.tx,0) + COALESCE(t.tx,0)
    ) ORDER BY (COALESCE(a.total,0) + COALESCE(t.total,0)) DESC), '[]'::jsonb)
    INTO v_pos_breakdown
    FROM merged m LEFT JOIN alc a ON a.pos_name = m.pos_name
    LEFT JOIN tk t ON t.pos_name = m.pos_name;
  EXCEPTION WHEN OTHERS THEN v_pos_breakdown := '[]'::jsonb;
  END;

  BEGIN
    WITH prods AS (
      SELECT c.name AS name, 'Carta' AS kind,
        SUM(si.quantity)::int AS qty, SUM(si.subtotal)::numeric AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN cocktails c ON c.id = si.cocktail_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY c.name
      UNION ALL
      SELECT tt.name AS name, 'Ticket' AS kind,
        SUM(tsi.quantity)::int AS qty, SUM(tsi.line_total)::numeric AS total
      FROM ticket_sale_items tsi
      JOIN ticket_sales ts ON ts.id = tsi.ticket_sale_id
      JOIN ticket_types tt ON tt.id = tsi.ticket_type_id
      WHERE ts.jornada_id = p_jornada_id AND ts.payment_status = 'paid'
      GROUP BY tt.name
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', name, 'kind', kind, 'quantity', qty, 'total', total
    ) ORDER BY qty DESC, total DESC), '[]'::jsonb)
    INTO v_top_products
    FROM (SELECT * FROM prods ORDER BY qty DESC, total DESC LIMIT 5) top5;
  EXCEPTION WHEN OTHERS THEN v_top_products := '[]'::jsonb;
  END;

  BEGIN
    WITH q AS (
      SELECT cq.id, cq.created_by, cq.max_uses, cq.used_count
      FROM courtesy_qr cq
      WHERE cq.venue_id = v_jornada.venue_id
        AND cq.created_at >= v_opened_at
        AND cq.created_at <= COALESCE(v_closed_at, now())
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'issuer_name', issuer_name, 'qr_count', qr_count,
      'total_uses', total_uses, 'redeemed_count', redeemed_count
    ) ORDER BY qr_count DESC), '[]'::jsonb)
    INTO v_courtesies
    FROM (
      SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Desconocido') AS issuer_name,
        COUNT(*) AS qr_count,
        COALESCE(SUM(q.max_uses), 0) AS total_uses,
        COALESCE(SUM(q.used_count), 0) AS redeemed_count
      FROM q LEFT JOIN profiles p ON p.id = q.created_by
      GROUP BY COALESCE(NULLIF(trim(p.full_name), ''), 'Desconocido')
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_courtesies := '[]'::jsonb;
  END;

  BEGIN
    WITH w AS (
      SELECT wr.product_id, wr.quantity, wr.unit_type,
        COALESCE(wr.estimated_cost, 0) AS estimated_cost,
        COALESCE(p.name, 'Producto') AS product_name
      FROM waste_requests wr
      LEFT JOIN products p ON p.id = wr.product_id
      WHERE wr.status = 'APPROVED'
        AND wr.venue_id = v_jornada.venue_id
        AND (wr.jornada_id = p_jornada_id
             OR (wr.approved_at >= v_opened_at
                 AND wr.approved_at <= COALESCE(v_closed_at, now())))
    )
    SELECT jsonb_build_object(
      'count', (SELECT COUNT(*) FROM w),
      'total_cost', COALESCE((SELECT SUM(estimated_cost) FROM w), 0),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'product_name', product_name,
          'quantity', quantity,
          'unit_type', unit_type,
          'estimated_cost', estimated_cost
        ) ORDER BY estimated_cost DESC)
        FROM (SELECT * FROM w ORDER BY estimated_cost DESC LIMIT 10) top
      ), '[]'::jsonb)
    ) INTO v_waste_summary;
  EXCEPTION WHEN OTHERS THEN v_waste_summary := '{}'::jsonb;
  END;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_supabase_url := NULL;
    END;
  END IF;
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://rboiblptylnsgcciutrk.supabase.co';
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_service_role_key := NULL;
  END;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'dispatch_jornada_closed_email: missing service_role_key in vault';
    RETURN;
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT lower(email) AS email, name FROM (
      SELECT p.notification_email AS email,
        COALESCE(NULLIF(trim(p.full_name), ''), p.notification_email) AS name
      FROM profiles p
      JOIN worker_roles wr ON wr.worker_id = p.id
      LEFT JOIN notification_preferences np
        ON np.worker_id = p.id AND np.event_type = 'jornada_closed' AND np.channel = 'email'
      WHERE wr.role IN ('admin','gerencia')
        AND COALESCE(p.is_active, true) = true
        AND p.notification_email IS NOT NULL
        AND trim(p.notification_email) <> ''
        AND COALESCE(np.is_enabled, true) = true
      UNION
      SELECT jne.email, COALESCE(jne.label, jne.email) AS name
      FROM jornada_notification_emails jne
      WHERE jne.venue_id = v_jornada.venue_id AND jne.is_enabled = true
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
        'courtesies_issued', v_courtesies,
        'payment_summary', v_payment_summary,
        'top_products', v_top_products,
        'waste_summary', v_waste_summary
      )
    );
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-transactional-email',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_role_key),
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to enqueue email for %: %', v_recipient.email, SQLERRM;
    END;
  END LOOP;
END;
$function$;