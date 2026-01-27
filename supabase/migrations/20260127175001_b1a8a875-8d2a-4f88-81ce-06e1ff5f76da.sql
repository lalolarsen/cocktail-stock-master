-- =====================================================
-- BERLÍN POS INFRASTRUCTURE MIGRATION
-- Venue: 4e128e76-980d-4233-a438-92aa02cfb50b
-- =====================================================

-- A) ADD NEW COLUMNS TO pos_terminals
-- =====================================================

-- Add code column (unique identifier per venue)
ALTER TABLE public.pos_terminals 
ADD COLUMN IF NOT EXISTS code text;

-- Add zone column 
ALTER TABLE public.pos_terminals 
ADD COLUMN IF NOT EXISTS zone text;

-- Add pos_kind column (cashier or scanner)
ALTER TABLE public.pos_terminals 
ADD COLUMN IF NOT EXISTS pos_kind text CHECK (pos_kind IN ('cashier', 'scanner'));

-- Add business_type column (tickets, alcohol, cloakroom)
ALTER TABLE public.pos_terminals 
ADD COLUMN IF NOT EXISTS business_type text CHECK (business_type IN ('tickets', 'alcohol', 'cloakroom'));

-- Add unique constraint on venue_id + code
CREATE UNIQUE INDEX IF NOT EXISTS pos_terminals_venue_code_unique 
ON public.pos_terminals(venue_id, code) WHERE code IS NOT NULL;

-- =====================================================
-- B) CREATE STOCK LOCATIONS (ZONES) FOR BERLÍN
-- =====================================================

INSERT INTO public.stock_locations (id, venue_id, name, type, is_active)
VALUES 
  ('a1000000-0000-0000-0000-000000000001', '4e128e76-980d-4233-a438-92aa02cfb50b', 'Entrada', 'bar', true),
  ('a1000000-0000-0000-0000-000000000002', '4e128e76-980d-4233-a438-92aa02cfb50b', 'Guardarropía', 'bar', true),
  ('a1000000-0000-0000-0000-000000000003', '4e128e76-980d-4233-a438-92aa02cfb50b', 'Pista', 'bar', true),
  ('a1000000-0000-0000-0000-000000000004', '4e128e76-980d-4233-a438-92aa02cfb50b', 'Club', 'bar', true),
  ('a1000000-0000-0000-0000-000000000005', '4e128e76-980d-4233-a438-92aa02cfb50b', 'Terraza', 'bar', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- C) INSERT 14 POS TERMINALS FOR BERLÍN (UPSERT)
-- =====================================================

-- Helper: we'll use INSERT with ON CONFLICT on the unique index
-- First, delete any existing POS for this venue to do a clean insert
DELETE FROM public.pos_terminals WHERE venue_id = '4e128e76-980d-4233-a438-92aa02cfb50b';

-- ENTRADA (2 POS)
INSERT INTO public.pos_terminals (venue_id, name, code, zone, pos_kind, business_type, location_id, pos_type, is_cash_register, is_active)
VALUES
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Principal (Entrada)', 'entrada-tickets-caja-principal', 'Entrada', 'cashier', 'tickets', 'a1000000-0000-0000-0000-000000000001', 'ticket_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Remota (Entrada)', 'entrada-tickets-caja-remota', 'Entrada', 'cashier', 'tickets', 'a1000000-0000-0000-0000-000000000001', 'ticket_sales', true, true);

-- GUARDARROPÍA (1 POS)
INSERT INTO public.pos_terminals (venue_id, name, code, zone, pos_kind, business_type, location_id, pos_type, is_cash_register, is_active)
VALUES
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Guardarropía', 'guardarropia-cloakroom-caja', 'Guardarropía', 'cashier', 'cloakroom', 'a1000000-0000-0000-0000-000000000002', 'alcohol_sales', true, true);

-- PISTA (5 POS)
INSERT INTO public.pos_terminals (venue_id, name, code, zone, pos_kind, business_type, location_id, pos_type, is_cash_register, is_active)
VALUES
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Pista Principal', 'pista-alcohol-caja-principal', 'Pista', 'cashier', 'alcohol', 'a1000000-0000-0000-0000-000000000003', 'alcohol_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Barra Pista Principal (Lector)', 'pista-alcohol-lector-barra', 'Pista', 'scanner', 'alcohol', 'a1000000-0000-0000-0000-000000000003', 'alcohol_sales', false, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja VIP (Pista)', 'pista-alcohol-caja-vip', 'Pista', 'cashier', 'alcohol', 'a1000000-0000-0000-0000-000000000003', 'alcohol_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Ultra VIP (Pista)', 'pista-alcohol-caja-ultravip', 'Pista', 'cashier', 'alcohol', 'a1000000-0000-0000-0000-000000000003', 'alcohol_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Barra VIP (Lector)', 'pista-alcohol-lector-vip', 'Pista', 'scanner', 'alcohol', 'a1000000-0000-0000-0000-000000000003', 'alcohol_sales', false, true);

-- CLUB (2 POS)
INSERT INTO public.pos_terminals (venue_id, name, code, zone, pos_kind, business_type, location_id, pos_type, is_cash_register, is_active)
VALUES
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Club', 'club-alcohol-caja', 'Club', 'cashier', 'alcohol', 'a1000000-0000-0000-0000-000000000004', 'alcohol_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Barra Club (Lector)', 'club-alcohol-lector', 'Club', 'scanner', 'alcohol', 'a1000000-0000-0000-0000-000000000004', 'alcohol_sales', false, true);

-- TERRAZA (4 POS)
INSERT INTO public.pos_terminals (venue_id, name, code, zone, pos_kind, business_type, location_id, pos_type, is_cash_register, is_active)
VALUES
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja Principal Terraza', 'terraza-alcohol-caja-principal', 'Terraza', 'cashier', 'alcohol', 'a1000000-0000-0000-0000-000000000005', 'alcohol_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Barra Principal Terraza (Lector)', 'terraza-alcohol-lector-principal', 'Terraza', 'scanner', 'alcohol', 'a1000000-0000-0000-0000-000000000005', 'alcohol_sales', false, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Caja VIP Terraza', 'terraza-alcohol-caja-vip', 'Terraza', 'cashier', 'alcohol', 'a1000000-0000-0000-0000-000000000005', 'alcohol_sales', true, true),
  ('4e128e76-980d-4233-a438-92aa02cfb50b', 'Barra VIP Terraza (Lector)', 'terraza-alcohol-lector-vip', 'Terraza', 'scanner', 'alcohol', 'a1000000-0000-0000-0000-000000000005', 'alcohol_sales', false, true);

-- =====================================================
-- D) CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_pos_terminals_venue_zone ON public.pos_terminals(venue_id, zone);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_venue_business ON public.pos_terminals(venue_id, business_type);