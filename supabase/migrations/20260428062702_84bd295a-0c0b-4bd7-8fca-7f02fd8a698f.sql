
CREATE OR REPLACE FUNCTION public.get_monthly_jornadas_summary(
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  jornada_id uuid,
  numero_jornada integer,
  nombre text,
  fecha date,
  semana_inicio date,
  hora_apertura time,
  hora_cierre time,
  estado text,
  forced_close boolean,
  requires_review boolean,
  total_sales numeric,
  sales_count integer,
  cancelled_total numeric,
  cancelled_count integer,
  alcohol_sales numeric,
  ticket_sales numeric,
  cash_sales numeric,
  card_sales numeric,
  other_payments numeric,
  top_sellers jsonb,
  financial jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_start date;
  v_end date;
BEGIN
  -- Resolve user's venue (mirrors useAppSession isolation)
  SELECT venue_id INTO v_venue_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_venue_id IS NULL THEN
    RETURN;
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  RETURN QUERY
  WITH js AS (
    SELECT j.*
    FROM public.jornadas j
    WHERE j.venue_id = v_venue_id
      AND j.fecha BETWEEN v_start AND v_end
  ),
  alcohol AS (
    SELECT
      s.jornada_id,
      COALESCE(SUM(CASE WHEN NOT s.is_cancelled THEN s.total_amount ELSE 0 END), 0) AS alcohol_total,
      COUNT(*) FILTER (WHERE NOT s.is_cancelled) AS active_count,
      COALESCE(SUM(CASE WHEN s.is_cancelled THEN s.total_amount ELSE 0 END), 0) AS cancelled_total,
      COUNT(*) FILTER (WHERE s.is_cancelled) AS cancelled_count,
      COALESCE(SUM(CASE WHEN NOT s.is_cancelled AND s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0) AS cash_total,
      COALESCE(SUM(CASE WHEN NOT s.is_cancelled AND s.payment_method = 'card' THEN s.total_amount ELSE 0 END), 0) AS card_total
    FROM public.sales s
    WHERE s.venue_id = v_venue_id
      AND s.jornada_id IN (SELECT id FROM js)
    GROUP BY s.jornada_id
  ),
  tickets AS (
    SELECT
      t.jornada_id,
      COALESCE(SUM(t.total), 0)::numeric AS ticket_total,
      COUNT(*) AS ticket_count,
      COALESCE(SUM(CASE WHEN t.payment_method = 'cash' THEN t.total ELSE 0 END), 0)::numeric AS cash_total,
      COALESCE(SUM(CASE WHEN t.payment_method = 'card' THEN t.total ELSE 0 END), 0)::numeric AS card_total
    FROM public.ticket_sales t
    WHERE t.venue_id = v_venue_id
      AND t.payment_status = 'paid'
      AND t.jornada_id IN (SELECT id FROM js)
    GROUP BY t.jornada_id
  ),
  seller_alcohol AS (
    SELECT s.jornada_id, s.seller_id AS seller_id, SUM(s.total_amount) AS total, COUNT(*) AS cnt
    FROM public.sales s
    WHERE s.venue_id = v_venue_id
      AND NOT s.is_cancelled
      AND s.jornada_id IN (SELECT id FROM js)
    GROUP BY s.jornada_id, s.seller_id
  ),
  seller_tickets AS (
    SELECT t.jornada_id, t.sold_by_worker_id AS seller_id, SUM(t.total)::numeric AS total, COUNT(*) AS cnt
    FROM public.ticket_sales t
    WHERE t.venue_id = v_venue_id
      AND t.payment_status = 'paid'
      AND t.sold_by_worker_id IS NOT NULL
      AND t.jornada_id IN (SELECT id FROM js)
    GROUP BY t.jornada_id, t.sold_by_worker_id
  ),
  sellers_combined AS (
    SELECT jornada_id, seller_id, SUM(total) AS total, SUM(cnt) AS cnt
    FROM (
      SELECT * FROM seller_alcohol
      UNION ALL
      SELECT * FROM seller_tickets
    ) u
    GROUP BY jornada_id, seller_id
  ),
  sellers_ranked AS (
    SELECT
      sc.jornada_id,
      sc.seller_id,
      sc.total,
      sc.cnt,
      COALESCE(p.full_name, p.email, 'Desconocido') AS name,
      ROW_NUMBER() OVER (PARTITION BY sc.jornada_id ORDER BY sc.total DESC) AS rk
    FROM sellers_combined sc
    LEFT JOIN public.profiles p ON p.id = sc.seller_id
  ),
  top_sellers_agg AS (
    SELECT jornada_id,
      jsonb_agg(jsonb_build_object('name', name, 'total', total, 'count', cnt) ORDER BY total DESC) AS top
    FROM sellers_ranked
    WHERE rk <= 3
    GROUP BY jornada_id
  ),
  fin AS (
    SELECT f.jornada_id,
      jsonb_build_object(
        'gross_sales_total', f.gross_sales_total,
        'net_sales_total', f.net_sales_total,
        'expenses_total', f.expenses_total,
        'net_operational_result', f.net_operational_result,
        'cogs_total', f.cogs_total,
        'gross_margin_pct', f.gross_margin_pct,
        'cash_difference', f.cash_difference,
        'tokens_pending_count', f.tokens_pending_count
      ) AS data
    FROM public.jornada_financial_summary f
    WHERE f.venue_id = v_venue_id
      AND f.pos_id IS NULL
      AND f.jornada_id IN (SELECT id FROM js)
  )
  SELECT
    js.id,
    js.numero_jornada,
    js.nombre,
    js.fecha,
    js.semana_inicio,
    js.hora_apertura,
    js.hora_cierre,
    js.estado,
    js.forced_close,
    js.requires_review,
    (COALESCE(a.alcohol_total, 0) + COALESCE(t.ticket_total, 0))::numeric AS total_sales,
    (COALESCE(a.active_count, 0) + COALESCE(t.ticket_count, 0))::integer AS sales_count,
    COALESCE(a.cancelled_total, 0)::numeric AS cancelled_total,
    COALESCE(a.cancelled_count, 0)::integer AS cancelled_count,
    COALESCE(a.alcohol_total, 0)::numeric AS alcohol_sales,
    COALESCE(t.ticket_total, 0)::numeric AS ticket_sales,
    (COALESCE(a.cash_total, 0) + COALESCE(t.cash_total, 0))::numeric AS cash_sales,
    (COALESCE(a.card_total, 0) + COALESCE(t.card_total, 0))::numeric AS card_sales,
    GREATEST(
      (COALESCE(a.alcohol_total, 0) + COALESCE(t.ticket_total, 0))
      - (COALESCE(a.cash_total, 0) + COALESCE(t.cash_total, 0))
      - (COALESCE(a.card_total, 0) + COALESCE(t.card_total, 0)),
      0
    )::numeric AS other_payments,
    COALESCE(ts.top, '[]'::jsonb) AS top_sellers,
    COALESCE(fin.data, NULL) AS financial
  FROM js
  LEFT JOIN alcohol a ON a.jornada_id = js.id
  LEFT JOIN tickets t ON t.jornada_id = js.id
  LEFT JOIN top_sellers_agg ts ON ts.jornada_id = js.id
  LEFT JOIN fin ON fin.jornada_id = js.id
  ORDER BY js.fecha DESC, js.numero_jornada DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_jornadas_summary(integer, integer) TO authenticated;
