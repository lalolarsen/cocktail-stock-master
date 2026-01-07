-- Create function to enqueue financial summary notifications to gerencia
CREATE OR REPLACE FUNCTION public.enqueue_financial_summary_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_venue_id uuid;
  v_venue_name text;
  v_jornada_fecha date;
  v_worker record;
  v_subject text;
  v_idempotency_key text;
BEGIN
  -- Get venue info
  SELECT v.id, v.name INTO v_venue_id, v_venue_name
  FROM venues v
  WHERE v.id = NEW.venue_id;

  -- Get jornada date
  SELECT j.fecha INTO v_jornada_fecha
  FROM jornadas j
  WHERE j.id = NEW.jornada_id;

  -- Build email subject
  v_subject := format('Cierre de jornada — %s — %s', 
    COALESCE(v_venue_name, 'Venue'),
    COALESCE(v_jornada_fecha::text, NEW.closed_at::date::text));

  -- Find all gerencia users for this venue
  FOR v_worker IN
    SELECT p.id, COALESCE(p.notification_email, p.email) as email
    FROM profiles p
    JOIN worker_roles wr ON wr.worker_id = p.id
    WHERE wr.role = 'gerencia'
      AND (wr.venue_id = v_venue_id OR wr.venue_id IS NULL)
      AND p.is_active = true
      AND COALESCE(p.notification_email, p.email) IS NOT NULL
  LOOP
    -- Create idempotency key
    v_idempotency_key := format('financial_summary_%s_%s', NEW.jornada_id, v_worker.id);
    
    -- Insert notification log (skip if already exists)
    INSERT INTO notification_logs (
      event_type,
      jornada_id,
      venue_id,
      recipient_email,
      recipient_worker_id,
      email_subject,
      status,
      idempotency_key
    ) VALUES (
      'financial_summary',
      NEW.jornada_id,
      v_venue_id,
      v_worker.email,
      v_worker.id,
      v_subject,
      'queued',
      v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on jornada_financial_summary insert
DROP TRIGGER IF EXISTS trigger_enqueue_financial_summary ON jornada_financial_summary;
CREATE TRIGGER trigger_enqueue_financial_summary
  AFTER INSERT ON jornada_financial_summary
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_financial_summary_notifications();