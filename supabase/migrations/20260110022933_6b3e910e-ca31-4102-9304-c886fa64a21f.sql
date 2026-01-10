-- Performance indexes for high-volume tables
-- Adjusted to match actual column names in schema

-- Sales indexes
CREATE INDEX IF NOT EXISTS idx_sales_venue_created_at ON sales(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_jornada_created_at ON sales(jornada_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_seller_created_at ON sales(seller_id, created_at DESC);

-- Sales documents indexes (no venue_id column, use sale_id join or status)
CREATE INDEX IF NOT EXISTS idx_sales_documents_status_created_at ON sales_documents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_documents_sale_created_at ON sales_documents(sale_id, created_at DESC);

-- Stock movements indexes (no venue_id, use jornada_id and location columns)
CREATE INDEX IF NOT EXISTS idx_stock_movements_jornada_created_at ON stock_movements(jornada_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created_at ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_from_location_created_at ON stock_movements(from_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_location_created_at ON stock_movements(to_location_id, created_at DESC);

-- Pickup redemptions log indexes
CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_bartender_created_at ON pickup_redemptions_log(bartender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_result_created_at ON pickup_redemptions_log(result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pickup_redemptions_sale_id ON pickup_redemptions_log(sale_id);

-- Expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_venue_created_at ON expenses(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_jornada_created_at ON expenses(jornada_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_venue_jornada ON expenses(venue_id, jornada_id);

-- Gross income entries indexes
CREATE INDEX IF NOT EXISTS idx_gross_income_venue_created_at ON gross_income_entries(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gross_income_jornada_created_at ON gross_income_entries(jornada_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gross_income_venue_jornada ON gross_income_entries(venue_id, jornada_id);

-- Jornadas indexes
CREATE INDEX IF NOT EXISTS idx_jornadas_venue_created_at ON jornadas(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jornadas_venue_estado ON jornadas(venue_id, estado);
CREATE INDEX IF NOT EXISTS idx_jornadas_fecha ON jornadas(fecha DESC);

-- Ticket sales indexes
CREATE INDEX IF NOT EXISTS idx_ticket_sales_venue_created_at ON ticket_sales(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_sales_jornada_created_at ON ticket_sales(jornada_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_sales_worker_created_at ON ticket_sales(sold_by_worker_id, created_at DESC);

-- Purchase documents indexes
CREATE INDEX IF NOT EXISTS idx_purchase_documents_venue_created_at ON purchase_documents(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_status_created_at ON purchase_documents(status, created_at DESC);

-- App monitoring indexes
CREATE INDEX IF NOT EXISTS idx_app_error_logs_venue_created_at ON app_error_logs(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_route_created_at ON app_error_logs(route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_events_venue_created_at ON app_audit_events(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_events_action_created_at ON app_audit_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_events_status_created_at ON app_audit_events(status, created_at DESC);