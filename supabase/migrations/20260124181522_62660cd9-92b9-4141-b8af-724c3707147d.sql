-- Add 'developer' to the app_role enum
-- This role is for internal feature flag management, not venue-assignable
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';