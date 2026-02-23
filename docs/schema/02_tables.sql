-- ╔══════════════════════════════════════════════════════════════╗
-- ║  STOCKIA / DiStock — TABLES                               ║
-- ║  Generated: 2026-02-23                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE public.admin_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_worker_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.app_audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  user_id uuid,
  action text NOT NULL,
  status text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  user_id uuid,
  route text NOT NULL,
  error_message text NOT NULL,
  stack text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_registers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  jornada_id uuid NOT NULL,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  expected_cash numeric,
  difference numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.cocktail_addons (
  cocktail_id uuid NOT NULL,
  addon_id uuid NOT NULL
);

CREATE TABLE public.cocktail_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cocktail_id uuid NOT NULL,
  product_id uuid,
  quantity numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  venue_id uuid NOT NULL,
  is_mixer_slot boolean NOT NULL DEFAULT false,
  mixer_category text
);

CREATE TABLE public.cocktails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'otros'::text,
  created_at timestamptz DEFAULT now(),
  venue_id uuid NOT NULL,
  waste_ml_per_serving numeric DEFAULT 3
);

CREATE TABLE public.courtesy_qr (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT substr(encode(uuid_send(gen_random_uuid()), 'hex'::text), 1, 12),
  product_id uuid NOT NULL,
  product_name text NOT NULL DEFAULT ''::text,
  qty integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT (now() + '24:00:00'::interval),
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'::text,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.courtesy_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  courtesy_id uuid NOT NULL,
  redeemed_by uuid NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  pos_id uuid,
  jornada_id uuid NOT NULL,
  sale_id uuid,
  result text NOT NULL DEFAULT 'success'::text,
  reason text,
  venue_id uuid NOT NULL
);

CREATE TABLE public.demo_event_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  event_type text NOT NULL,
  user_role text,
  user_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.developer_feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.developer_flag_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  key text NOT NULL,
  from_enabled boolean,
  to_enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE TABLE public.developer_reset_audit (
  id bigint NOT NULL DEFAULT nextval('developer_reset_audit_id_seq'::regclass),
  developer_user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  table_key text NOT NULL,
  table_name text NOT NULL,
  deleted_rows bigint NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expense_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  expense_type text NOT NULL DEFAULT 'freight'::text,
  description text,
  amount_net numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric NOT NULL,
  expense_type text NOT NULL,
  category text,
  jornada_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  venue_id uuid,
  source_type text,
  source_id uuid,
  payment_method text NOT NULL DEFAULT 'cash'::text,
  pos_id uuid,
  expense_category text,
  tax_type text
);

CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.feature_flags_master (
  key text NOT NULL,
  name text NOT NULL,
  description text,
  default_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gross_income_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  amount integer NOT NULL,
  description text,
  jornada_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoicing_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_provider text NOT NULL DEFAULT 'mock'::text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  receipt_mode text NOT NULL DEFAULT 'hybrid'::text,
  venue_id uuid NOT NULL
);

CREATE TABLE public.jornada_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  jornada_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  actor_source text NOT NULL,
  reason text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jornada_cash_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  jornada_id uuid NOT NULL,
  pos_id uuid NOT NULL,
  opening_cash_amount numeric NOT NULL DEFAULT 0,
  cash_sales_total numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  closing_cash_counted numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jornada_cash_openings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  jornada_id uuid NOT NULL,
  pos_id uuid NOT NULL,
  opening_cash_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jornada_cash_pos_defaults (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  pos_id uuid NOT NULL,
  default_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jornada_cash_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  cash_opening_mode text NOT NULL DEFAULT 'prompt'::text,
  default_opening_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_close_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE public.jornada_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dia_semana integer NOT NULL,
  hora_apertura time without time zone NOT NULL,
  hora_cierre time without time zone NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.jornada_financial_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  jornada_id uuid NOT NULL,
  pos_id uuid,
  gross_sales_total numeric NOT NULL DEFAULT 0,
  sales_by_payment jsonb NOT NULL DEFAULT '{}'::jsonb,
  transactions_count integer NOT NULL DEFAULT 0,
  cancelled_sales_total numeric NOT NULL DEFAULT 0,
  cancelled_transactions_count integer NOT NULL DEFAULT 0,
  net_sales_total numeric NOT NULL DEFAULT 0,
  expenses_total numeric NOT NULL DEFAULT 0,
  expenses_by_type jsonb NOT NULL DEFAULT '{}'::jsonb,
  opening_cash numeric DEFAULT 0,
  cash_sales numeric DEFAULT 0,
  cash_expenses numeric DEFAULT 0,
  expected_cash numeric DEFAULT 0,
  counted_cash numeric DEFAULT 0,
  cash_difference numeric DEFAULT 0,
  net_operational_result numeric NOT NULL DEFAULT 0,
  closed_by uuid NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  pos_type text,
  tokens_issued_count integer DEFAULT 0,
  tokens_redeemed_count integer DEFAULT 0,
  tokens_pending_count integer DEFAULT 0,
  tokens_expired_count integer DEFAULT 0,
  tokens_cancelled_count integer DEFAULT 0,
  cogs_total numeric DEFAULT 0,
  gross_margin numeric DEFAULT 0,
  gross_margin_pct numeric DEFAULT 0,
  cost_data_complete boolean DEFAULT true,
  missing_cost_items jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE public.jornadas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero_jornada integer NOT NULL,
  semana_inicio date NOT NULL,
  fecha date NOT NULL,
  hora_apertura time without time zone,
  hora_cierre time without time zone,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL,
  nombre text NOT NULL DEFAULT ''::text,
  forced_close boolean NOT NULL DEFAULT false,
  forced_reason text,
  forced_by_user_id uuid,
  forced_at timestamptz,
  requires_review boolean NOT NULL DEFAULT false
);

CREATE TABLE public.learning_product_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  supplier_rut text,
  raw_text text NOT NULL,
  product_id uuid NOT NULL,
  detected_multiplier integer NOT NULL DEFAULT 1,
  confidence numeric NOT NULL DEFAULT 0.8,
  times_used integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rut_code text NOT NULL,
  venue_id uuid,
  success boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.login_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  login_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  jornada_id uuid,
  venue_id uuid NOT NULL
);

CREATE TABLE public.notification_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  event_type text NOT NULL,
  jornada_id uuid,
  recipient_email text NOT NULL,
  recipient_worker_id uuid,
  status text NOT NULL DEFAULT 'queued'::text,
  error_message text,
  idempotency_key text NOT NULL,
  email_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  worker_id uuid NOT NULL,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email'::text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.open_bottle_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  open_bottle_id uuid NOT NULL,
  event_type text NOT NULL,
  related_token_id uuid,
  delta_ml numeric NOT NULL,
  before_ml numeric NOT NULL,
  after_ml numeric NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.open_bottles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN'::text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id uuid NOT NULL,
  label_code text,
  initial_ml numeric NOT NULL,
  remaining_ml numeric NOT NULL,
  last_counted_ml numeric,
  last_counted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.operational_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  expense_date date NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  net_amount numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 19,
  vat_amount numeric NOT NULL DEFAULT 0,
  specific_tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  supplier_source text NOT NULL DEFAULT 'manual'::text,
  tax_notes text
);

CREATE TABLE public.pickup_redemptions_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pickup_token_id uuid,
  sale_id uuid,
  bartender_id uuid NOT NULL,
  pos_id text,
  result redemption_result NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.pickup_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid,
  token text NOT NULL DEFAULT substr(encode(uuid_send(gen_random_uuid()), 'hex'::text), 1, 16),
  status pickup_token_status NOT NULL DEFAULT 'issued'::pickup_token_status,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + '02:00:00'::interval),
  redeemed_at timestamptz,
  redeemed_by uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  bar_location_id uuid,
  source_type text DEFAULT 'sale'::text,
  ticket_sale_id uuid,
  cover_cocktail_id uuid,
  cover_quantity integer DEFAULT 1,
  venue_id uuid,
  jornada_id uuid
);

CREATE TABLE public.pos_terminals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid,
  pos_type text NOT NULL DEFAULT 'alcohol_sales'::text,
  is_cash_register boolean NOT NULL DEFAULT true,
  code text,
  zone text,
  pos_kind text,
  business_type text,
  bar_location_id uuid,
  auto_redeem boolean NOT NULL DEFAULT false
);

CREATE TABLE public.product_addons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_modifier numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  venue_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.product_name_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  raw_name text NOT NULL,
  normalized_name text NOT NULL,
  product_id uuid NOT NULL,
  usage_count integer DEFAULT 1,
  venue_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  current_stock numeric NOT NULL DEFAULT 0,
  minimum_stock numeric NOT NULL DEFAULT 10,
  unit text NOT NULL DEFAULT 'ml'::text,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  code text NOT NULL,
  category product_category NOT NULL,
  venue_id uuid NOT NULL,
  is_active_in_sales boolean DEFAULT true,
  is_mixer boolean DEFAULT false,
  subcategory text,
  capacity_ml integer
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  point_of_sale text,
  rut_code text,
  venue_id uuid,
  internal_email text,
  is_active boolean DEFAULT true,
  notification_email text
);

CREATE TABLE public.provider_product_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  provider_name text NOT NULL,
  raw_product_name text NOT NULL,
  product_id uuid NOT NULL,
  confidence_score numeric DEFAULT 1.0,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid,
  provider_name text,
  provider_rut text,
  document_number text,
  document_date date,
  total_amount numeric DEFAULT 0,
  file_path text NOT NULL,
  file_type text NOT NULL,
  raw_text text,
  extracted_data jsonb,
  status text NOT NULL DEFAULT 'pending'::text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  net_amount numeric,
  iva_amount numeric,
  total_amount_gross numeric,
  audit_trail jsonb DEFAULT '[]'::jsonb,
  specific_tax_amount numeric DEFAULT 0
);

CREATE TABLE public.purchase_import_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_document_id uuid NOT NULL,
  action text NOT NULL,
  user_id uuid,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_import_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  user_id uuid NOT NULL,
  purchase_document_id uuid,
  provider_name text,
  provider_rut text,
  document_number text,
  document_date text,
  net_amount numeric DEFAULT 0,
  iva_amount numeric DEFAULT 0,
  total_amount_gross numeric DEFAULT 0,
  raw_extraction jsonb,
  computed_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  discount_mode text DEFAULT 'APPLY_TO_GROSS'::text,
  status text DEFAULT 'draft'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_import_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_import_id uuid NOT NULL,
  line_index integer NOT NULL DEFAULT 0,
  raw_text text,
  qty_invoiced numeric,
  unit_price_net numeric,
  line_total_net numeric,
  discount_pct numeric,
  detected_multiplier integer NOT NULL DEFAULT 1,
  units_real numeric NOT NULL DEFAULT 0,
  cost_unit_net numeric NOT NULL DEFAULT 0,
  product_id uuid,
  classification text NOT NULL DEFAULT 'inventory'::text,
  tax_category_id uuid,
  status text NOT NULL DEFAULT 'REVIEW'::text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tax_rate numeric,
  net_line_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.purchase_import_taxes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_import_id uuid NOT NULL,
  tax_type text NOT NULL,
  tax_label text NOT NULL,
  tax_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_name text,
  supplier_rut text,
  document_number text,
  document_date date,
  net_subtotal numeric,
  vat_amount numeric,
  total_amount numeric,
  currency text NOT NULL DEFAULT 'CLP'::text,
  raw_file_url text,
  raw_extraction_json jsonb,
  status text NOT NULL DEFAULT 'UPLOADED'::text,
  issues_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  iaba_10_total numeric NOT NULL DEFAULT 0,
  iaba_18_total numeric NOT NULL DEFAULT 0,
  ila_vino_total numeric NOT NULL DEFAULT 0,
  ila_cerveza_total numeric NOT NULL DEFAULT 0,
  ila_destilados_total numeric NOT NULL DEFAULT 0,
  specific_taxes_total numeric NOT NULL DEFAULT 0,
  financial_summary jsonb
);

CREATE TABLE public.purchase_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_document_id uuid NOT NULL,
  raw_product_name text NOT NULL,
  extracted_quantity numeric,
  extracted_unit_price numeric,
  extracted_total numeric,
  matched_product_id uuid,
  confirmed_quantity numeric,
  confirmed_unit_price numeric,
  match_confidence numeric DEFAULT 0,
  is_confirmed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid,
  extracted_uom text DEFAULT 'Unidad'::text,
  conversion_factor numeric DEFAULT 1.0,
  normalized_quantity numeric,
  normalized_unit_cost numeric,
  classification text DEFAULT 'inventory'::text,
  item_status text DEFAULT 'pending_match'::text,
  expense_category text,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  subtotal_before_discount numeric,
  tax_iaba_10 numeric DEFAULT 0,
  tax_iaba_18 numeric DEFAULT 0,
  tax_ila_vin numeric DEFAULT 0,
  tax_ila_cer numeric DEFAULT 0,
  tax_ila_lic numeric DEFAULT 0,
  tax_category text
);

CREATE TABLE public.purchase_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  product_id uuid NOT NULL,
  units_real numeric NOT NULL,
  cost_unit_net numeric NOT NULL,
  line_total_net numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_import_id uuid,
  venue_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_name text,
  supplier_rut text,
  document_number text,
  document_date date,
  net_subtotal numeric,
  vat_credit numeric,
  total_amount numeric,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.replenishment_plan_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  replenishment_plan_id uuid NOT NULL,
  to_location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.replenishment_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  jornada_id uuid,
  plan_date date NOT NULL DEFAULT CURRENT_DATE,
  name text NOT NULL,
  status replenishment_plan_status NOT NULL DEFAULT 'draft'::replenishment_plan_status,
  created_by uuid NOT NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.resettable_tables (
  key text NOT NULL,
  table_name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  danger_level smallint NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_item_addons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL,
  addon_id uuid,
  addon_name text NOT NULL,
  price_modifier numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  cocktail_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  subtotal numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_number text NOT NULL,
  seller_id uuid NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  point_of_sale text NOT NULL,
  is_cancelled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  jornada_id uuid NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'cash'::payment_method,
  payment_status text NOT NULL DEFAULT 'paid'::text,
  pos_id uuid NOT NULL,
  bar_location_id uuid,
  venue_id uuid NOT NULL,
  receipt_source text DEFAULT 'internal'::text,
  sale_category text NOT NULL DEFAULT 'alcohol'::text,
  net_amount numeric,
  iva_debit_amount numeric,
  vat_rate numeric DEFAULT 0.19
);

CREATE TABLE public.sales_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  document_type document_type NOT NULL DEFAULT 'boleta'::document_type,
  folio text,
  status document_status NOT NULL DEFAULT 'pending'::document_status,
  pdf_url text,
  issued_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'mock'::text,
  provider_ref text,
  idempotency_key text,
  retry_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  venue_id uuid NOT NULL
);

CREATE TABLE public.sidebar_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  role text NOT NULL,
  menu_key text NOT NULL,
  menu_label text NOT NULL,
  icon_name text NOT NULL DEFAULT 'Wine'::text,
  view_type text NOT NULL,
  feature_flag text,
  external_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.specific_tax_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate_pct numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  venue_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  code text,
  label text
);

CREATE TABLE public.stock_alerts (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  product_id uuid,
  alert_type text NOT NULL DEFAULT 'low_stock'::text,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  jornada_id uuid,
  venue_id uuid NOT NULL
);

CREATE TABLE public.stock_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.stock_intake_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  default_location_id uuid,
  total_net numeric NOT NULL DEFAULT 0,
  total_vat numeric NOT NULL DEFAULT 0,
  total_specific_tax numeric NOT NULL DEFAULT 0,
  total_other_tax numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  notes text
);

CREATE TABLE public.stock_intake_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity numeric NOT NULL,
  net_unit_cost numeric NOT NULL,
  vat_unit numeric NOT NULL DEFAULT 0,
  specific_tax_unit numeric NOT NULL DEFAULT 0,
  other_tax_unit numeric NOT NULL DEFAULT 0,
  total_unit numeric NOT NULL DEFAULT 0,
  total_line numeric NOT NULL DEFAULT 0,
  tax_category_id uuid,
  venue_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_location_minimums (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  minimum_stock numeric NOT NULL DEFAULT 0,
  venue_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type location_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid
);

CREATE TABLE public.stock_lots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  expires_at date NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual'::text,
  is_depleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  product_id uuid,
  movement_type movement_type NOT NULL,
  quantity numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  jornada_id uuid,
  pickup_token_id uuid,
  from_location_id uuid,
  to_location_id uuid,
  transfer_id uuid,
  stock_lot_id uuid,
  unit_cost numeric,
  source_type text,
  unit_cost_snapshot numeric,
  total_cost_snapshot numeric,
  venue_id uuid NOT NULL,
  vat_amount numeric DEFAULT 0,
  specific_tax_amount numeric DEFAULT 0,
  percent_visual smallint
);

CREATE TABLE public.stock_predictions (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  product_id uuid,
  predicted_consumption numeric NOT NULL,
  prediction_period text NOT NULL,
  confidence_score numeric,
  created_at timestamptz DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.stock_transfer_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.stock_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_location_id uuid NOT NULL,
  to_location_id uuid NOT NULL,
  transferred_by uuid NOT NULL,
  jornada_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.supplier_product_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  supplier_name text NOT NULL,
  normalized_text text NOT NULL,
  raw_examples jsonb DEFAULT '[]'::jsonb,
  product_id uuid,
  pack_multiplier integer DEFAULT 1,
  pack_priced boolean DEFAULT false,
  tax_category text DEFAULT 'NONE'::text,
  confidence numeric DEFAULT 0.5,
  times_seen integer DEFAULT 1,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.ticket_sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_sale_id uuid NOT NULL,
  ticket_type_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price integer NOT NULL,
  line_total integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  venue_id uuid NOT NULL
);

CREATE TABLE public.ticket_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  ticket_number text NOT NULL,
  sold_by_worker_id uuid NOT NULL,
  jornada_id uuid,
  total integer NOT NULL,
  payment_method payment_method DEFAULT 'cash'::payment_method,
  payment_status text NOT NULL DEFAULT 'paid'::text,
  created_at timestamptz DEFAULT now(),
  pos_id uuid
);

CREATE TABLE public.ticket_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  name text NOT NULL,
  price integer NOT NULL,
  includes_cover boolean DEFAULT false,
  cover_cocktail_id uuid,
  cover_quantity integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL
);

CREATE TABLE public.user_venue_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.venue_feature_flags (
  venue_id uuid NOT NULL,
  flag_key text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.venues (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text,
  plan_type text NOT NULL DEFAULT 'trial'::text,
  max_pos integer NOT NULL DEFAULT 2,
  max_bars integer NOT NULL DEFAULT 2,
  trial_ends_at timestamptz DEFAULT (now() + '14 days'::interval),
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_step integer NOT NULL DEFAULT 0,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.waste_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric NOT NULL,
  unit_type text NOT NULL DEFAULT 'unit'::text,
  reason text NOT NULL,
  notes text,
  evidence_url text,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'::text,
  requested_by_user_id uuid NOT NULL,
  approved_by_user_id uuid,
  approved_at timestamptz,
  rejection_reason text,
  bottle_type text,
  percent_visual smallint,
  estimated_cost numeric DEFAULT 0,
  jornada_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.worker_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  venue_id uuid,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
