-- ============================================
-- DiStock Database Schema Export
-- Part 6: Cash Management & Expenses
-- ============================================

-- ============================================
-- CASH SETTINGS (Global per venue)
-- ============================================
CREATE TABLE public.jornada_cash_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID UNIQUE REFERENCES public.venues(id),
  cash_opening_mode TEXT DEFAULT 'prompt',
  default_opening_amount NUMERIC DEFAULT 0,
  auto_close_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- CASH POS DEFAULTS
-- ============================================
CREATE TABLE public.jornada_cash_pos_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  pos_id UUID NOT NULL REFERENCES public.pos_terminals(id),
  default_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- CASH OPENINGS (Per jornada + POS)
-- ============================================
CREATE TABLE public.jornada_cash_openings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id),
  pos_id UUID NOT NULL REFERENCES public.pos_terminals(id),
  opening_cash_amount NUMERIC DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- CASH CLOSINGS (Per jornada + POS)
-- ============================================
CREATE TABLE public.jornada_cash_closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id),
  pos_id UUID NOT NULL REFERENCES public.pos_terminals(id),
  opening_cash_amount NUMERIC DEFAULT 0,
  cash_sales_total NUMERIC DEFAULT 0,
  expected_cash NUMERIC DEFAULT 0,
  closing_cash_counted NUMERIC DEFAULT 0,
  difference NUMERIC DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(jornada_id, pos_id)
);

-- ============================================
-- CASH REGISTERS (Legacy)
-- ============================================
CREATE TABLE public.cash_registers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  jornada_id UUID NOT NULL UNIQUE REFERENCES public.jornadas(id),
  opening_cash NUMERIC DEFAULT 0,
  closing_cash NUMERIC,
  expected_cash NUMERIC,
  difference NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_cash_registers_venue ON public.cash_registers(venue_id);

-- ============================================
-- EXPENSES
-- ============================================
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id),
  pos_id UUID REFERENCES public.pos_terminals(id),
  expense_type TEXT NOT NULL,
  expense_category TEXT,
  category TEXT,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  tax_type TEXT,
  notes TEXT,
  source_type TEXT,
  source_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_expenses_venue ON public.expenses(venue_id);
CREATE INDEX idx_expenses_jornada ON public.expenses(jornada_id);

-- ============================================
-- GROSS INCOME ENTRIES
-- ============================================
CREATE TABLE public.gross_income_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  jornada_id UUID REFERENCES public.jornadas(id),
  source_type TEXT NOT NULL,
  source_id UUID,
  amount INTEGER NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_gross_income_venue ON public.gross_income_entries(venue_id);
CREATE INDEX idx_gross_income_jornada ON public.gross_income_entries(jornada_id);

-- ============================================
-- JORNADA FINANCIAL SUMMARY
-- ============================================
CREATE TABLE public.jornada_financial_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id),
  pos_id UUID REFERENCES public.pos_terminals(id),
  pos_type TEXT,
  
  -- Sales metrics
  gross_sales_total NUMERIC DEFAULT 0,
  net_sales_total NUMERIC DEFAULT 0,
  cancelled_sales_total NUMERIC DEFAULT 0,
  transactions_count INTEGER DEFAULT 0,
  cancelled_transactions_count INTEGER DEFAULT 0,
  sales_by_payment JSONB DEFAULT '{}',
  
  -- Cash reconciliation
  opening_cash NUMERIC DEFAULT 0,
  cash_sales NUMERIC DEFAULT 0,
  cash_expenses NUMERIC DEFAULT 0,
  expected_cash NUMERIC DEFAULT 0,
  counted_cash NUMERIC DEFAULT 0,
  cash_difference NUMERIC DEFAULT 0,
  
  -- Expenses
  expenses_total NUMERIC DEFAULT 0,
  expenses_by_type JSONB DEFAULT '{}',
  
  -- Cost of Goods Sold
  cogs_total NUMERIC DEFAULT 0,
  gross_margin NUMERIC DEFAULT 0,
  gross_margin_pct NUMERIC DEFAULT 0,
  cost_data_complete BOOLEAN DEFAULT true,
  missing_cost_items JSONB DEFAULT '[]',
  
  -- Token metrics
  tokens_issued_count INTEGER DEFAULT 0,
  tokens_redeemed_count INTEGER DEFAULT 0,
  tokens_pending_count INTEGER DEFAULT 0,
  tokens_expired_count INTEGER DEFAULT 0,
  tokens_cancelled_count INTEGER DEFAULT 0,
  
  -- Result
  net_operational_result NUMERIC DEFAULT 0,
  
  -- Metadata
  closed_by UUID NOT NULL REFERENCES public.profiles(id),
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_financial_summary_venue ON public.jornada_financial_summary(venue_id);
CREATE INDEX idx_financial_summary_jornada ON public.jornada_financial_summary(jornada_id);

-- ============================================
-- JORNADA AUDIT LOG
-- ============================================
CREATE TABLE public.jornada_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id),
  actor_user_id UUID,
  actor_source TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_jornada_audit_jornada ON public.jornada_audit_log(jornada_id);
