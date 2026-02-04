-- Add discount fields to purchase_items
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC;