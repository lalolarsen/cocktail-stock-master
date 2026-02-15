-- Add financial_summary JSONB column to persist the internal financial JSON
ALTER TABLE purchase_imports
ADD COLUMN IF NOT EXISTS financial_summary JSONB DEFAULT NULL;