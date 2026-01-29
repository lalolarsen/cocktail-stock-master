-- Make location_id nullable for POS terminals
-- The "Golden Rule" is that QR codes can be redeemed at any location
-- Stock deduction only happens upon redemption, not at the point of sale

ALTER TABLE public.pos_terminals
ALTER COLUMN location_id DROP NOT NULL;

-- Add a comment explaining the rationale
COMMENT ON COLUMN public.pos_terminals.location_id IS 'Optional: bar location for redemption terminals only. Sales POS terminals do not need a location since stock is deducted at QR redemption time.';