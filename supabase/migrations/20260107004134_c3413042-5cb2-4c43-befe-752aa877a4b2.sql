-- Step 1: Add ticket_seller to app_role enum (separate transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ticket_seller';