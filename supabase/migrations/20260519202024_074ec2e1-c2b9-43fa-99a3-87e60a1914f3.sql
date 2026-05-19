
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

  -- URL: prefer GUC, else vault project_url, else hardcoded project ref
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
        'courtesies_issued', v_courtesies
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
