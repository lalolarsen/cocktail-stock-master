
-- Add 'waste' to movement_type enum
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'waste';

-- Add percent_visual column to stock_movements for audit trail
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS percent_visual smallint;

-- Add check constraint for percent_visual range
ALTER TABLE public.stock_movements
ADD CONSTRAINT stock_movements_percent_visual_check
CHECK (percent_visual IS NULL OR (percent_visual >= 0 AND percent_visual <= 100));
