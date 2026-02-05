-- ============================================
-- DiStock Database Schema Export
-- Part 7: Purchase Import / Invoice Reader
-- ============================================

-- ============================================
-- PURCHASE DOCUMENTS (Imported invoices)
-- ============================================
CREATE TABLE public.purchase_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  provider_name TEXT,
  provider_rut TEXT,
  document_number TEXT,
  document_type TEXT,
  document_date DATE,
  subtotal NUMERIC,
  iva_amount NUMERIC,
  ila_amount NUMERIC,
  iaba_amount NUMERIC,
  total_amount NUMERIC,
  currency TEXT DEFAULT 'CLP',
  status TEXT DEFAULT 'draft',
  storage_path TEXT,
  file_name TEXT,
  raw_extracted_data JSONB,
  audit_trail JSONB DEFAULT '[]',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_purchase_docs_venue ON public.purchase_documents(venue_id);
CREATE INDEX idx_purchase_docs_status ON public.purchase_documents(status);
CREATE INDEX idx_purchase_docs_date ON public.purchase_documents(document_date);

-- ============================================
-- PURCHASE ITEMS (Line items from invoices)
-- ============================================
CREATE TABLE public.purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_document_id UUID NOT NULL REFERENCES public.purchase_documents(id) ON DELETE CASCADE,
  raw_product_name TEXT,
  raw_quantity NUMERIC,
  raw_unit_price NUMERIC,
  raw_total NUMERIC,
  
  -- Matched/normalized values
  product_id UUID REFERENCES public.products(id),
  normalized_quantity NUMERIC,
  normalized_unit_cost NUMERIC,
  
  -- Multiplier/pack detection
  pack_multiplier INTEGER DEFAULT 1,
  pack_priced BOOLEAN DEFAULT false,
  
  -- Discount
  discount_pct NUMERIC DEFAULT 0,
  
  -- Tax classification
  tax_type TEXT, -- 'IVA', 'ILA', 'IABA', etc.
  is_tax_expense BOOLEAN DEFAULT false, -- ILA/IABA = expense, not inventory
  
  -- Confirmation
  confirmed_quantity NUMERIC,
  confirmed_unit_price NUMERIC,
  is_confirmed BOOLEAN DEFAULT false,
  item_status TEXT DEFAULT 'pending',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_purchase_items_doc ON public.purchase_items(purchase_document_id);
CREATE INDEX idx_purchase_items_product ON public.purchase_items(product_id);

-- ============================================
-- PURCHASE IMPORT DRAFTS (Persistent UI state)
-- ============================================
CREATE TABLE public.purchase_import_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  status TEXT DEFAULT 'uploading',
  step INTEGER DEFAULT 0,
  
  -- Uploaded file info
  file_name TEXT,
  storage_path TEXT,
  
  -- Extracted data
  extracted_data JSONB DEFAULT '{}',
  
  -- Line items with user edits
  line_items JSONB DEFAULT '[]',
  
  -- Provider info
  provider_name TEXT,
  provider_rut TEXT,
  document_number TEXT,
  document_date DATE,
  
  -- Totals
  subtotal NUMERIC,
  iva_amount NUMERIC,
  ila_amount NUMERIC,
  iaba_amount NUMERIC,
  total_amount NUMERIC,
  
  -- Final document reference
  purchase_document_id UUID REFERENCES public.purchase_documents(id),
  
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_import_drafts_venue ON public.purchase_import_drafts(venue_id);
CREATE INDEX idx_import_drafts_status ON public.purchase_import_drafts(status);

-- ============================================
-- PURCHASE IMPORT AUDIT
-- ============================================
CREATE TABLE public.purchase_import_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_document_id UUID NOT NULL REFERENCES public.purchase_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  user_id UUID,
  previous_state JSONB,
  new_state JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_import_audit_doc ON public.purchase_import_audit(purchase_document_id);

-- ============================================
-- PROVIDER PRODUCT MAPPINGS (Learn from imports)
-- ============================================
CREATE TABLE public.provider_product_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  provider_name TEXT NOT NULL,
  raw_product_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  confidence_score NUMERIC DEFAULT 1.0,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(provider_name, raw_product_name, venue_id)
);

-- ============================================
-- PRODUCT NAME MAPPINGS (General fuzzy match)
-- ============================================
CREATE TABLE public.product_name_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
