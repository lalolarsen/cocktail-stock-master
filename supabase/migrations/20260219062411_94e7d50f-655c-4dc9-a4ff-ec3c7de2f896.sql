
-- Drop the old overloaded version without p_venue_id
DROP FUNCTION IF EXISTS public.consume_stock_fefo(
  uuid, uuid, numeric, boolean, uuid, text, uuid, text
);
