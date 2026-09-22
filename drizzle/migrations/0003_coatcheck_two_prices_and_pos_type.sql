ALTER TABLE public.coatcheck_settings ADD COLUMN IF NOT EXISTS price_backpack integer;
ALTER TABLE public.coatcheck_settings ADD COLUMN IF NOT EXISTS price_garment integer;

UPDATE public.coatcheck_settings
SET price_backpack = COALESCE(price_backpack, 2000),
    price_garment = COALESCE(price_garment, NULLIF(price_per_garment, 0), 1000);

COMMENT ON COLUMN public.coatcheck_settings.price_per_garment IS 'DEPRECATED: reemplazado por price_backpack y price_garment';

ALTER TABLE public.coatcheck_tickets ADD COLUMN IF NOT EXISTS item_type text;
COMMENT ON COLUMN public.coatcheck_tickets.item_type IS 'backpack | garment';

ALTER TABLE public.pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_pos_type_check;
ALTER TABLE public.pos_terminals ADD CONSTRAINT pos_terminals_pos_type_check
  CHECK (pos_type = ANY (ARRAY['alcohol_sales'::text, 'ticket_sales'::text, 'bar_redemption'::text, 'coatcheck'::text]));

CREATE OR REPLACE FUNCTION public.issue_coatcheck_ticket_v2(
  _venue_id uuid,
  _jornada_id uuid,
  _item_type text,
  _garment_count integer,
  _unit_price integer,
  _payment_method text,
  _note text DEFAULT NULL::text
)
RETURNS public.coatcheck_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _next INTEGER;
  _row public.coatcheck_tickets;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF _garment_count IS NULL OR _garment_count < 1 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  IF COALESCE(_item_type, '') NOT IN ('backpack', 'garment') THEN
    RAISE EXCEPTION 'Tipo de ítem inválido';
  END IF;

  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO _next
  FROM public.coatcheck_tickets
  WHERE jornada_id IS NOT DISTINCT FROM _jornada_id;

  INSERT INTO public.coatcheck_tickets (
    venue_id, jornada_id, ticket_number, garment_count,
    unit_price, amount, payment_method, note, issued_by, item_type
  ) VALUES (
    _venue_id, _jornada_id, _next, _garment_count,
    COALESCE(_unit_price, 0), COALESCE(_unit_price, 0) * _garment_count,
    COALESCE(_payment_method, 'cash'), _note, auth.uid(), _item_type
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.issue_coatcheck_ticket_v2(uuid, uuid, text, integer, integer, text, text) TO authenticated;