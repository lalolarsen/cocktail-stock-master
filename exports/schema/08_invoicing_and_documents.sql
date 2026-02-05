-- ============================================
-- DiStock Database Schema Export
-- Part 8: Invoicing & Document Issuance
-- ============================================

-- ============================================
-- INVOICING CONFIG
-- ============================================
CREATE TABLE public.invoicing_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL UNIQUE REFERENCES public.venues(id),
  active_provider TEXT DEFAULT 'mock',
  receipt_mode TEXT DEFAULT 'hybrid',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- ISSUED DOCUMENTS (Boletas/Facturas)
-- ============================================
CREATE TABLE public.issued_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  sale_id UUID REFERENCES public.sales(id),
  ticket_sale_id UUID REFERENCES public.ticket_sales(id),
  document_type public.document_type NOT NULL,
  status public.document_status DEFAULT 'pending',
  folio TEXT,
  provider TEXT,
  provider_response JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  issued_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_issued_docs_venue ON public.issued_documents(venue_id);
CREATE INDEX idx_issued_docs_sale ON public.issued_documents(sale_id);
CREATE INDEX idx_issued_docs_status ON public.issued_documents(status);
