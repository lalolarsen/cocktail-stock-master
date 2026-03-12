-- Drop old 3-param auto_redeem_sale_token that references non-existent stock_movements.location_id
DROP FUNCTION IF EXISTS public.auto_redeem_sale_token(uuid, uuid, uuid);

-- Drop the second consume_stock_fefo overload that references non-existent stock_movements columns (location_id, reference_id, bartender_id)
DROP FUNCTION IF EXISTS public.consume_stock_fefo(uuid, uuid, numeric, text, uuid, uuid, uuid, boolean, uuid, uuid);