-- Helper: dispatch jornada-closed email to all admins/gerencia of the venue
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
BEGIN
  SELECT j.*, v.name AS venue_name
  INTO v_jornada
  FROM jornadas j
  LEFT JOIN venues v ON v.id = j.venue_id
  WHERE j.id = p_jornada_id;

  IF NOT FOUND THEN RETURN; END IF;
  v_venue_name := COALESCE(v_jornada.venue_name, 'Local');
  v_jornada_label := COALESCE(v_jornada.nombre, 'Jornada ' || to_char((v_jornada.fecha_apertura AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD'));

  -- Aggregate gross sales (alcohol + tickets, no cancelled)
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_gross
  FROM sales WHERE jornada_id = p_jornada_id AND is_cancelled = false;

  v_total_gross := v_total_gross + COALESCE((
    SELECT SUM(total) FROM ticket_sales
    WHERE jornada_id = p_jornada_id AND payment_status = 'paid'
  ), 0);

  v_commission := round(v_total_gross * 0.025);
  v_total_net := v_total_gross - v_commission;

  -- COGS estimate from sales recipes (best-effort; if errors, default 0)
  BEGIN
    SELECT COALESCE(SUM(si.quantity * COALESCE(p.average_cost, 0)), 0)
    INTO v_cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false;
  EXCEPTION WHEN OTHERS THEN v_cogs := 0;
  END;

  -- Courtesies (sales with total = 0 marked courtesy)
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(
      (SELECT SUM(si2.quantity * COALESCE(p2.average_cost, 0))
       FROM sale_items si2 LEFT JOIN products p2 ON p2.id = si2.product_id
       WHERE si2.sale_id = s.id)
    ), 0)
    INTO v_courtesies_count, v_courtesies_cost
    FROM sales s
    WHERE s.jornada_id = p_jornada_id
      AND s.is_cancelled = false
      AND COALESCE(s.is_courtesy, false) = true;
  EXCEPTION WHEN OTHERS THEN
    v_courtesies_count := 0; v_courtesies_cost := 0;
  END;

  -- QR pickup tokens redeemed/pending in jornada
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE status = 'redeemed'),
      COUNT(*) FILTER (WHERE status = 'pending')
    INTO v_qr_redeemed, v_qr_pending
    FROM pickup_tokens
    WHERE jornada_id = p_jornada_id;
  EXCEPTION WHEN OTHERS THEN
    v_qr_redeemed := 0; v_qr_pending := 0;
  END;

  -- POS breakdown
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'pos_name', pos_name,
      'total', total,
      'cash', cash,
      'card', card,
      'tickets', 0,
      'transactions', tx
    ) ORDER BY total DESC), '[]'::jsonb)
    INTO v_pos_breakdown
    FROM (
      SELECT
        COALESCE(pt.name, 'POS') AS pos_name,
        ROUND(SUM(s.total_amount)) AS total,
        ROUND(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'cash')) AS cash,
        ROUND(SUM(s.total_amount) FILTER (WHERE s.payment_method <> 'cash')) AS card,
        COUNT(*) AS tx
      FROM sales s
      LEFT JOIN pos_terminals pt ON pt.id = s.pos_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY pt.name
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_pos_breakdown := '[]'::jsonb;
  END;

  -- Top 10 products
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', product_name,
      'quantity', qty,
      'revenue', revenue
    ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO v_top_products
    FROM (
      SELECT
        COALESCE(p.name, si.product_name, 'Producto') AS product_name,
        SUM(si.quantity)::int AS qty,
        ROUND(SUM(si.quantity * si.unit_price)) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.jornada_id = p_jornada_id AND s.is_cancelled = false
      GROUP BY COALESCE(p.name, si.product_name, 'Producto')
      ORDER BY revenue DESC
      LIMIT 10
    ) tp;
  EXCEPTION WHEN OTHERS THEN v_top_products := '[]'::jsonb;
  END;

  -- Build base payload
  v_payload := jsonb_build_object(
    'venue_name', v_venue_name,
    'jornada_label', v_jornada_label,
    'opened_at', v_jornada.fecha_apertura,
    'closed_at', now(),
    'closed_by', COALESCE((SELECT full_name FROM profiles WHERE id = auth.uid()), 'Sistema'),
    'forced_close', COALESCE(v_jornada.is_forced_close, false),
    'forced_reason', v_jornada.forced_close_reason,
    'total_gross', v_total_gross,
    'stockia_commission', v_commission,
    'total_net', v_total_net,
    'cogs', v_cogs,
    'gross_margin', v_total_net - v_cogs,
    'pos_breakdown', v_pos_breakdown,
    'top_products', v_top_products,
    'qr_redeemed', v_qr_redeemed,
    'qr_pending', v_qr_pending,
    'courtesies_count', v_courtesies_count,
    'courtesies_cost', v_courtesies_cost,
    'waste_cost', 0,
    'stock_alerts', '[]'::jsonb
  );

  -- Resolve secrets
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;

  IF v_supabase_url IS NULL THEN v_supabase_url := 'https://rboiblptylnsgcciutrk.supabase.co'; END IF;
  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'dispatch_jornada_closed_email: service role key not found in vault';
    RETURN;
  END IF;

  -- Loop over recipients (admin/gerencia of this venue with notification_email)
  FOR v_recipient IN
    SELECT DISTINCT COALESCE(p.notification_email, p.email) AS email
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    WHERE p.venue_id = v_jornada.venue_id
      AND p.is_active = true
      AND ur.role IN ('admin'::app_role, 'gerencia'::app_role)
      AND COALESCE(p.notification_email, p.email) IS NOT NULL
      AND COALESCE(p.notification_email, p.email) NOT LIKE '%@stockia.local'
  LOOP
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-transactional-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object(
        'templateName', 'jornada-closed-summary',
        'recipientEmail', v_recipient.email,
        'idempotencyKey', 'jornada-closed-' || p_jornada_id::text || '-' || md5(v_recipient.email),
        'templateData', v_payload
      )
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_jornada_closed_email(uuid) TO authenticated, service_role;

-- Wrap close_jornada_manual to call dispatch on success
CREATE OR REPLACE FUNCTION public.close_jornada_manual(p_jornada_id uuid, p_cash_closings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada RECORD;
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_pos_ids uuid[];
  v_required_pos uuid[];
  v_missing_pos uuid[];
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
BEGIN
  SELECT * INTO v_jornada FROM jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jornada no encontrada', 'failing_step', 'jornada_exists');
  END IF;
  IF v_jornada.estado <> 'activa' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La jornada no está activa (estado: ' || v_jornada.estado || ')', 'failing_step', 'jornada_active');
  END IF;

  v_venue_id := v_jornada.venue_id;

  SELECT array_agg(id) INTO v_required_pos
  FROM pos_terminals
  WHERE venue_id = v_venue_id AND is_active = true AND is_cash_register = true;
  IF v_required_pos IS NULL THEN v_required_pos := ARRAY[]::uuid[]; END IF;

  SELECT array_agg((elem->>'pos_id')::uuid) INTO v_pos_ids
  FROM jsonb_array_elements(p_cash_closings) AS elem;
  IF v_pos_ids IS NULL THEN v_pos_ids := ARRAY[]::uuid[]; END IF;

  SELECT array_agg(rp) INTO v_missing_pos
  FROM unnest(v_required_pos) AS rp
  WHERE rp <> ALL(v_pos_ids);

  IF v_missing_pos IS NOT NULL AND array_length(v_missing_pos, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Faltan confirmaciones para ' || array_length(v_missing_pos, 1) || ' POS', 'failing_step', 'missing_pos', 'missing_pos_ids', to_jsonb(v_missing_pos));
  END IF;

  FOR v_closing IN
    SELECT (elem->>'pos_id')::uuid AS pos_id,
           COALESCE((elem->>'confirmed')::boolean, false) AS confirmed,
           COALESCE(trim(elem->>'bartender_name'), '') AS bartender_name,
           COALESCE(elem->>'notes', '') AS notes,
           NULLIF(elem->>'closing_cash_counted', '')::numeric AS closing_cash_counted
    FROM jsonb_array_elements(p_cash_closings) AS elem
  LOOP
    IF NOT v_closing.confirmed THEN
      RETURN jsonb_build_object('success', false, 'error', 'Debes confirmar el cuadre físico de todos los POS', 'failing_step', 'confirmation_required', 'pos_id', v_closing.pos_id);
    END IF;
    IF v_closing.bartender_name = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Debes registrar el nombre del bartender/cajero de turno', 'failing_step', 'bartender_required', 'pos_id', v_closing.pos_id);
    END IF;

    SELECT COALESCE(opening_cash_amount, 0) INTO v_opening_cash
    FROM jornada_cash_openings
    WHERE jornada_id = p_jornada_id AND pos_id = v_closing.pos_id LIMIT 1;
    IF v_opening_cash IS NULL THEN v_opening_cash := 0; END IF;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales_alcohol
    FROM sales
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND is_cancelled = false
      AND pos_id = v_closing.pos_id;

    SELECT COALESCE(SUM(total), 0) INTO v_cash_sales_tickets
    FROM ticket_sales
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND payment_status = 'paid'
      AND pos_id = v_closing.pos_id;

    v_cash_sales := COALESCE(v_cash_sales_alcohol, 0) + COALESCE(v_cash_sales_tickets, 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM expenses
    WHERE jornada_id = p_jornada_id
      AND payment_method = 'cash'
      AND (pos_id = v_closing.pos_id OR pos_id IS NULL);

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
      v_closing.bartender_name, true
    )
    ON CONFLICT (jornada_id, pos_id) DO UPDATE SET
      opening_cash_amount = EXCLUDED.opening_cash_amount,
      cash_sales_total = EXCLUDED.cash_sales_total,
      expected_cash = EXCLUDED.expected_cash,
      closing_cash_counted = EXCLUDED.closing_cash_counted,
      difference = EXCLUDED.difference,
      notes = EXCLUDED.notes,
      bartender_name = EXCLUDED.bartender_name,
      physical_reconciliation_confirmed = true;
  END LOOP;

  v_hora_cierre := (v_now_santiago AT TIME ZONE 'America/Santiago')::time;
  UPDATE jornadas SET estado = 'cerrada', hora_cierre = v_hora_cierre, updated_at = v_now_santiago WHERE id = p_jornada_id;

  INSERT INTO jornada_audit_log (jornada_id, venue_id, action, actor_user_id, actor_source, meta)
  VALUES (p_jornada_id, v_venue_id, 'closed', v_user_id, 'manual', jsonb_build_object(
    'cash_closings_count', jsonb_array_length(p_cash_closings),
    'mode', 'physical_checklist'
  ));

  -- Dispatch summary email (non-blocking; errors swallowed)
  BEGIN
    PERFORM public.dispatch_jornada_closed_email(p_jornada_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_jornada_closed_email failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object('success', true);
END;
$function$;