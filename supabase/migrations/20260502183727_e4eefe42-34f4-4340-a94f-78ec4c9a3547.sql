
-- 1. Nueva columna opcional en jornadas
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS observacion_cierre text;

-- 2. Reemplazar close_jornada_manual: cash_closings opcional, sin checklist obligatorio, observación opcional
DROP FUNCTION IF EXISTS public.close_jornada_manual(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.close_jornada_manual(
  p_jornada_id uuid,
  p_cash_closings jsonb DEFAULT '[]'::jsonb,
  p_observacion text DEFAULT NULL
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

  -- Cash closings opcionales: solo procesar si vienen registros
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

-- 3. Actualizar dispatch_jornada_closed_email para incluir observacion_cierre en el payload
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
    SELECT DISTINCT
      COALESCE(p.notification_email, u.email) AS email,
      COALESCE(p.full_name, u.email) AS name
    FROM user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN profiles p ON p.user_id = ur.user_id
    WHERE ur.venue_id = v_jornada.venue_id
      AND ur.role IN ('admin', 'gerencia')
      AND COALESCE(p.notification_email, u.email) IS NOT NULL
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
        'observacion_cierre', v_jornada.observacion_cierre,
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
$function$;
