
-- P0 FIX Step 1: Add 'pending' to pickup_token_status enum
ALTER TYPE public.pickup_token_status ADD VALUE IF NOT EXISTS 'pending';
