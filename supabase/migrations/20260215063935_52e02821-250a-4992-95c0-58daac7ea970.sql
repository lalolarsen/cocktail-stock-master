
-- =============================================
-- FIX 1: Remove overly permissive "Everyone can view" policies
-- =============================================

-- Venues: Replace public SELECT with venue-scoped
DROP POLICY IF EXISTS "Everyone can view venues" ON public.venues;
CREATE POLICY "Users can view their own venue"
  ON public.venues
  FOR SELECT
  USING (id = get_user_venue_id());

-- Stock lots: Replace public SELECT with venue-scoped
DROP POLICY IF EXISTS "Everyone can view stock lots" ON public.stock_lots;
CREATE POLICY "Users can view stock lots for their venue"
  ON public.stock_lots
  FOR SELECT
  USING (venue_id = get_user_venue_id());

-- =============================================
-- FIX 2: Remove worker_pin from profiles table
-- =============================================

-- First clear all existing plaintext PINs
UPDATE public.profiles SET worker_pin = NULL;

-- Drop the column entirely
ALTER TABLE public.profiles DROP COLUMN IF EXISTS worker_pin;
