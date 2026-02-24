
-- Table for print job auditing and retry logic
CREATE TABLE public.print_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  pos_id UUID REFERENCES public.pos_terminals(id),
  sale_id UUID REFERENCES public.sales(id),
  pickup_token_id UUID REFERENCES public.pickup_tokens(id),
  user_id UUID NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'receipt_qr',
  print_status TEXT NOT NULL DEFAULT 'pending',
  printer_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_print_jobs_venue_status ON public.print_jobs(venue_id, print_status);
CREATE INDEX idx_print_jobs_sale ON public.print_jobs(sale_id);

-- Enable RLS
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Policies: workers can insert and read their own venue's print jobs
CREATE POLICY "Workers can insert print jobs"
  ON public.print_jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.worker_roles wr
      WHERE wr.worker_id = auth.uid()
        AND wr.venue_id = print_jobs.venue_id
    )
  );

CREATE POLICY "Workers can view print jobs in their venue"
  ON public.print_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_roles wr
      WHERE wr.worker_id = auth.uid()
        AND wr.venue_id = print_jobs.venue_id
    )
  );

CREATE POLICY "Workers can update their own print jobs"
  ON public.print_jobs FOR UPDATE
  USING (user_id = auth.uid());

-- Add print config columns to pos_terminals
ALTER TABLE public.pos_terminals
  ADD COLUMN IF NOT EXISTS auto_print_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS printer_name TEXT;
