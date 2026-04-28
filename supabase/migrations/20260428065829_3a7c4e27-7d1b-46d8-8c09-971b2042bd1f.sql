CREATE OR REPLACE FUNCTION public.get_jornadas_stats_bulk(p_jornada_ids uuid[])
RETURNS TABLE(
  jornada_id uuid,
  total_ventas numeric,
  cantidad_ventas integer,
  productos_vendidos integer,
  logins integer,
  cash_sales numeric,
  card_sales numeric,
  other_sales numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_id uuid;
BEGIN
  SELECT venue_id INTO v_venue_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  IF v_venue_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH alc AS (
    SELECT s.jornada_id AS j_id,
      COALESCE(SUM(s.total_amount), 0)::numeric AS total,
      COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0)::numeric AS cash,
      COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN s.total_amount ELSE 0 END), 0)::numeric AS card
    FROM public.sales s
    WHERE s.venue_id = v_venue_id
      AND s.is_cancelled = false
      AND s.jornada_id = ANY(p_jornada_ids)
    GROUP BY s.jornada_id
  ),
  alc_items AS (
    SELECT s.jornada_id AS j_id, COALESCE(SUM(si.quantity), 0)::integer AS qty
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.venue_id = v_venue_id
      AND s.is_cancelled = false
      AND s.jornada_id = ANY(p_jornada_ids)
    GROUP BY s.jornada_id
  ),
  tk AS (
    SELECT t.jornada_id AS j_id,
      COALESCE(SUM(t.total), 0)::numeric AS total,
      COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN t.payment_method = 'cash' THEN t.total ELSE 0 END), 0)::numeric AS cash,
      COALESCE(SUM(CASE WHEN t.payment_method = 'card' THEN t.total ELSE 0 END), 0)::numeric AS card
    FROM public.ticket_sales t
    WHERE t.venue_id = v_venue_id
      AND t.payment_status = 'paid'
      AND t.jornada_id = ANY(p_jornada_ids)
    GROUP BY t.jornada_id
  ),
  tk_items AS (
    SELECT t.jornada_id AS j_id, COALESCE(SUM(ti.quantity), 0)::integer AS qty
    FROM public.ticket_sale_items ti
    JOIN public.ticket_sales t ON t.id = ti.ticket_sale_id
    WHERE t.venue_id = v_venue_id
      AND t.payment_status = 'paid'
      AND t.jornada_id = ANY(p_jornada_ids)
    GROUP BY t.jornada_id
  ),
  lg AS (
    SELECT lh.jornada_id AS j_id, COUNT(*) AS cnt
    FROM public.login_history lh
    WHERE lh.jornada_id = ANY(p_jornada_ids)
    GROUP BY lh.jornada_id
  ),
  ids AS (SELECT unnest(p_jornada_ids) AS j_id)
  SELECT
    ids.j_id,
    (COALESCE(alc.total, 0) + COALESCE(tk.total, 0))::numeric,
    (COALESCE(alc.cnt, 0) + COALESCE(tk.cnt, 0))::integer,
    (COALESCE(alc_items.qty, 0) + COALESCE(tk_items.qty, 0))::integer,
    COALESCE(lg.cnt, 0)::integer,
    (COALESCE(alc.cash, 0) + COALESCE(tk.cash, 0))::numeric,
    (COALESCE(alc.card, 0) + COALESCE(tk.card, 0))::numeric,
    GREATEST(
      (COALESCE(alc.total, 0) + COALESCE(tk.total, 0))
      - (COALESCE(alc.cash, 0) + COALESCE(tk.cash, 0))
      - (COALESCE(alc.card, 0) + COALESCE(tk.card, 0)),
      0
    )::numeric
  FROM ids
  LEFT JOIN alc ON alc.j_id = ids.j_id
  LEFT JOIN alc_items ON alc_items.j_id = ids.j_id
  LEFT JOIN tk ON tk.j_id = ids.j_id
  LEFT JOIN tk_items ON tk_items.j_id = ids.j_id
  LEFT JOIN lg ON lg.j_id = ids.j_id;
END;
$function$;