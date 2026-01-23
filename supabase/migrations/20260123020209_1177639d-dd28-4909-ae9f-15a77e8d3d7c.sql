-- Drop the legacy 1-argument version of redeem_pickup_token
-- Only keep the 2-argument version that properly uses consume_stock_fefo
DROP FUNCTION IF EXISTS public.redeem_pickup_token(text);

-- Add comment documenting DiStock golden rule
COMMENT ON FUNCTION public.redeem_pickup_token(text, uuid) IS 
'DiStock Golden Rule: Inventory ONLY decreases on QR redemption, never on sale/ticket creation.
This is the SOLE code path that modifies stock (via consume_stock_fefo).
Idempotent: returns ALREADY_REDEEMED on duplicate scans without modifying stock.';