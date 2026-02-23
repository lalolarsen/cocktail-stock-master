-- ╔══════════════════════════════════════════════════════════════╗
-- ║  STOCKIA / DiStock — TRIGGERS                             ║
-- ║  Generated: 2026-02-23                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TRIGGER update_cash_registers_updated_at BEFORE UPDATE ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER check_jornada_closed_expenses BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION check_jornada_not_closed();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION update_feature_flags_updated_at();
CREATE TRIGGER check_jornada_closed_gross_income BEFORE INSERT ON public.gross_income_entries FOR EACH ROW EXECUTE FUNCTION check_jornada_not_closed();
CREATE TRIGGER update_invoicing_config_updated_at BEFORE UPDATE ON public.invoicing_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER enforce_single_open_jornada BEFORE INSERT OR UPDATE OF estado ON public.jornadas FOR EACH ROW EXECUTE FUNCTION check_single_open_jornada();
CREATE TRIGGER update_jornadas_updated_at BEFORE UPDATE ON public.jornadas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_open_bottles_updated_at BEFORE UPDATE ON public.open_bottles FOR EACH ROW EXECUTE FUNCTION update_open_bottles_updated_at();
CREATE TRIGGER enforce_pos_bar_location BEFORE INSERT OR UPDATE ON public.pos_terminals FOR EACH ROW EXECUTE FUNCTION check_pos_location_type();
CREATE TRIGGER update_pos_terminals_updated_at BEFORE UPDATE ON public.pos_terminals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_addons_updated_at BEFORE UPDATE ON public.product_addons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER enforce_product_cost BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION validate_product_cost();
CREATE TRIGGER trigger_check_low_stock AFTER UPDATE OF current_stock ON public.products FOR EACH ROW EXECUTE FUNCTION check_low_stock();
CREATE TRIGGER update_purchase_documents_updated_at BEFORE UPDATE ON public.purchase_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_import_drafts_updated_at BEFORE UPDATE ON public.purchase_import_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_imports_updated_at BEFORE UPDATE ON public.purchase_imports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_replenishment_plans_updated_at BEFORE UPDATE ON public.replenishment_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER check_jornada_closed_sales BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION check_jornada_not_closed();
CREATE TRIGGER on_sale_cancelled AFTER UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION cancel_sale_stock();
CREATE TRIGGER update_sales_documents_updated_at BEFORE UPDATE ON public.sales_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_fill_stock_alerts_venue_id BEFORE INSERT ON public.stock_alerts FOR EACH ROW EXECUTE FUNCTION fill_stock_alerts_venue_id();
CREATE TRIGGER update_stock_balances_updated_at BEFORE UPDATE ON public.stock_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stock_locations_updated_at BEFORE UPDATE ON public.stock_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER check_jornada_closed_stock_movements BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION check_jornada_not_closed();
CREATE TRIGGER trg_stock_movements_ensure_venue_id BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION stock_movements_ensure_venue_id();
CREATE TRIGGER trigger_update_stock AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION update_stock_on_movement();
CREATE TRIGGER trg_supplier_alias_updated_at BEFORE UPDATE ON public.supplier_product_aliases FOR EACH ROW EXECUTE FUNCTION update_supplier_alias_updated_at();
CREATE TRIGGER check_jornada_closed_ticket_sales BEFORE INSERT ON public.ticket_sales FOR EACH ROW EXECUTE FUNCTION check_jornada_not_closed();
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
