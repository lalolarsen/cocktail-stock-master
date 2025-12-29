-- Add idempotency and retry columns to sales_documents
ALTER TABLE public.sales_documents 
ADD COLUMN IF NOT EXISTS idempotency_key text,
ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Create unique index for idempotency (provider + sale_id + document_type combination)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_documents_idempotency 
ON public.sales_documents (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Create index for finding documents to retry
CREATE INDEX IF NOT EXISTS idx_sales_documents_retry 
ON public.sales_documents (status, next_retry_at) 
WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Update RLS policies for sales_documents
-- Drop existing restrictive policies to recreate them properly
DROP POLICY IF EXISTS "Users can view their own sales documents" ON public.sales_documents;
DROP POLICY IF EXISTS "Admins can manage all sales documents" ON public.sales_documents;
DROP POLICY IF EXISTS "Sellers can create sales documents" ON public.sales_documents;
DROP POLICY IF EXISTS "Gerencia can view all sales documents" ON public.sales_documents;

-- Sellers can view their own sale documents
CREATE POLICY "Sellers can view own sales documents"
ON public.sales_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sales_documents.sale_id
    AND sales.seller_id = auth.uid()
  )
);

-- Admins can view and manage all sales documents
CREATE POLICY "Admins can view all sales documents"
ON public.sales_documents FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sales documents"
ON public.sales_documents FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Gerencia can view all sales documents
CREATE POLICY "Gerencia can view all sales documents"
ON public.sales_documents FOR SELECT
USING (has_role(auth.uid(), 'gerencia'));

-- Gerencia can update (for retry functionality)
CREATE POLICY "Gerencia can update sales documents"
ON public.sales_documents FOR UPDATE
USING (has_role(auth.uid(), 'gerencia'));

-- Edge function can insert/update via service role (no RLS needed for service role)
-- This policy allows authenticated users to insert only for their own sales
CREATE POLICY "Authenticated users can insert for own sales"
ON public.sales_documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sales_documents.sale_id
    AND sales.seller_id = auth.uid()
  )
);

-- Add comment for documentation
COMMENT ON COLUMN public.sales_documents.idempotency_key IS 'Unique key: provider:sale_id:document_type for preventing duplicate issuance';
COMMENT ON COLUMN public.sales_documents.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN public.sales_documents.last_attempt_at IS 'Timestamp of last issuance attempt';
COMMENT ON COLUMN public.sales_documents.next_retry_at IS 'Scheduled time for next retry attempt';