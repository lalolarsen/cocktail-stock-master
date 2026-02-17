-- Add transfer movement types for clean replenishment tracking
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'transfer_in';