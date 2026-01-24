-- Step 1: Add 'card' to existing enum (this needs to be committed first)
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'card';