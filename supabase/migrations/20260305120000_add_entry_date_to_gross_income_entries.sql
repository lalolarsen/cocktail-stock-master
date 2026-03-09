-- Add entry_date to gross_income_entries for proper month-based filtering
-- This allows backdating income declarations (similar to expense_date in operational_expenses)
ALTER TABLE public.gross_income_entries
  ADD COLUMN IF NOT EXISTS entry_date date;

-- Backfill existing rows using their created_at date
UPDATE public.gross_income_entries
SET entry_date = (created_at AT TIME ZONE 'America/Santiago')::date
WHERE entry_date IS NULL;

-- Make it non-nullable with a sensible default going forward
ALTER TABLE public.gross_income_entries
  ALTER COLUMN entry_date SET DEFAULT (now() AT TIME ZONE 'America/Santiago')::date;

-- Index for efficient monthly queries
CREATE INDEX IF NOT EXISTS idx_gross_income_entries_entry_date
  ON public.gross_income_entries (venue_id, entry_date);
