-- ============================================
-- DiStock Database Schema Export
-- Part 13: Triggers
-- ============================================

-- ============================================
-- PRODUCTS TRIGGERS
-- ============================================

-- Low stock alert trigger
CREATE TRIGGER trigger_check_low_stock
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.check_low_stock();

-- ============================================
-- JORNADAS TRIGGERS
-- ============================================

-- Prevent multiple open jornadas
CREATE TRIGGER trigger_check_single_open_jornada
  BEFORE INSERT OR UPDATE ON public.jornadas
  FOR EACH ROW
  EXECUTE FUNCTION public.check_single_open_jornada();

-- ============================================
-- SALES TRIGGERS
-- ============================================

-- Prevent sales on closed jornadas
CREATE TRIGGER trigger_check_jornada_not_closed_sales
  BEFORE INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- Handle sale cancellation stock restoration
CREATE OR REPLACE FUNCTION public.cancel_sale_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record pickup_tokens%ROWTYPE;
  item_record RECORD;
  ingredient_record RECORD;
BEGIN
  IF NEW.is_cancelled = TRUE AND OLD.is_cancelled = FALSE THEN
    -- Check if token was redeemed (stock was deducted)
    SELECT * INTO v_token_record
    FROM pickup_tokens
    WHERE sale_id = NEW.id AND status = 'redeemed'
    LIMIT 1;
    
    -- Only restore stock if the pickup was already redeemed
    IF FOUND THEN
      FOR item_record IN
        SELECT cocktail_id, quantity FROM sale_items WHERE sale_id = NEW.id
      LOOP
        FOR ingredient_record IN
          SELECT product_id, quantity FROM cocktail_ingredients WHERE cocktail_id = item_record.cocktail_id
        LOOP
          -- Restore stock via movement
          INSERT INTO stock_movements (product_id, quantity, movement_type, notes, from_location_id)
          VALUES (ingredient_record.product_id, ingredient_record.quantity * item_record.quantity, 'entrada', 
                  'Cancelación post-retiro - Venta ' || NEW.sale_number, v_token_record.bar_location_id);
          
          -- Restore stock_balances
          IF v_token_record.bar_location_id IS NOT NULL THEN
            UPDATE stock_balances
            SET quantity = quantity + (ingredient_record.quantity * item_record.quantity), updated_at = now()
            WHERE product_id = ingredient_record.product_id AND location_id = v_token_record.bar_location_id;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
    
    -- Cancel all pending tokens
    UPDATE pickup_tokens SET status = 'cancelled' WHERE sale_id = NEW.id AND status = 'issued';
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_cancel_sale_stock
  AFTER UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_sale_stock();

-- ============================================
-- EXPENSES TRIGGERS
-- ============================================

CREATE TRIGGER trigger_check_jornada_not_closed_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.check_jornada_not_closed();

-- ============================================
-- POS TERMINALS TRIGGERS
-- ============================================

-- Ensure POS is linked to bar location
CREATE OR REPLACE FUNCTION public.check_pos_location_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stock_locations WHERE id = NEW.location_id AND type = 'bar'
  ) THEN
    RAISE EXCEPTION 'POS terminal must be linked to a bar location';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_check_pos_location_type
  BEFORE INSERT OR UPDATE ON public.pos_terminals
  FOR EACH ROW
  WHEN (NEW.location_id IS NOT NULL)
  EXECUTE FUNCTION public.check_pos_location_type();

-- ============================================
-- NOTIFICATION TRIGGERS
-- ============================================

-- Enqueue notifications on financial summary insert
CREATE OR REPLACE FUNCTION public.enqueue_financial_summary_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_id UUID;
  v_venue_name TEXT;
  v_jornada_fecha DATE;
  v_worker RECORD;
  v_subject TEXT;
  v_idempotency_key TEXT;
BEGIN
  SELECT v.id, v.name INTO v_venue_id, v_venue_name
  FROM venues v WHERE v.id = NEW.venue_id;

  SELECT j.fecha INTO v_jornada_fecha
  FROM jornadas j WHERE j.id = NEW.jornada_id;

  v_subject := format('Cierre de jornada — %s — %s', 
    COALESCE(v_venue_name, 'Venue'),
    COALESCE(v_jornada_fecha::text, NEW.closed_at::date::text));

  FOR v_worker IN
    SELECT p.id, COALESCE(p.notification_email, p.email) as email
    FROM profiles p
    JOIN worker_roles wr ON wr.worker_id = p.id
    WHERE wr.role = 'gerencia'
      AND (wr.venue_id = v_venue_id OR wr.venue_id IS NULL)
      AND p.is_active = true
      AND COALESCE(p.notification_email, p.email) IS NOT NULL
  LOOP
    v_idempotency_key := format('financial_summary_%s_%s', NEW.jornada_id, v_worker.id);
    
    INSERT INTO notification_logs (event_type, jornada_id, venue_id, recipient_email, recipient_worker_id, email_subject, status, idempotency_key)
    VALUES ('financial_summary', NEW.jornada_id, v_venue_id, v_worker.email, v_worker.id, v_subject, 'queued', v_idempotency_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_enqueue_financial_notifications
  AFTER INSERT ON public.jornada_financial_summary
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_financial_summary_notifications();
