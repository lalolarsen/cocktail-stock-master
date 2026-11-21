CREATE INDEX IF NOT EXISTS idx_pickup_tokens_ticket_sale_id ON public.pickup_tokens (ticket_sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items (sale_id);