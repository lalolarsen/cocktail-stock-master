
-- RPC: request_sale_void
CREATE OR REPLACE FUNCTION public.request_sale_void(
  p_sale_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_user_id uuid := auth.uid();
  v_request_type public.void_request_type;
  v_total_tokens int;
  v_redeemed_tokens int;
  v_pending_existing int;
  v_request_id uuid;
BEGIN
  -- Get venue from sale
  SELECT venue_id INTO v_venue_id FROM sales WHERE id = p_sale_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  -- Check no pending void request already exists
  SELECT count(*) INTO v_pending_existing
  FROM void_requests
  WHERE sale_id = p_sale_id AND status IN ('pending', 'approved');
  
  IF v_pending_existing > 0 THEN
    RAISE EXCEPTION 'Ya existe una solicitud de anulación pendiente para esta venta';
  END IF;

  -- Classify request_type based on token states
  SELECT count(*), count(*) FILTER (WHERE status = 'redeemed')
  INTO v_total_tokens, v_redeemed_tokens
  FROM pickup_tokens
  WHERE sale_id = p_sale_id OR ticket_sale_id = p_sale_id;

  IF v_total_tokens = 0 THEN
    v_request_type := 'unknown';
  ELSIF v_redeemed_tokens = 0 THEN
    v_request_type := 'pre_redeem';
  ELSE
    v_request_type := 'post_redeem';
  END IF;

  INSERT INTO void_requests (venue_id, sale_id, request_type, reason, notes, requested_by)
  VALUES (v_venue_id, p_sale_id, v_request_type, p_reason, p_notes, v_user_id)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- RPC: review_void_request
CREATE OR REPLACE FUNCTION public.review_void_request(
  p_request_id uuid,
  p_action text, -- 'approved' or 'rejected'
  p_review_notes text DEFAULT NULL,
  p_execution_mode text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_status public.void_request_status;
BEGIN
  SELECT status INTO v_current_status FROM void_requests WHERE id = p_request_id;
  
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  
  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden revisar solicitudes pendientes';
  END IF;

  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Acción inválida: use approved o rejected';
  END IF;

  UPDATE void_requests
  SET status = p_action::public.void_request_status,
      reviewed_by = v_user_id,
      reviewed_at = now(),
      review_notes = p_review_notes,
      execution_mode = CASE WHEN p_execution_mode IS NOT NULL THEN p_execution_mode::public.void_execution_mode ELSE execution_mode END
  WHERE id = p_request_id;
END;
$$;

-- RPC: execute_void_request
CREATE OR REPLACE FUNCTION public.execute_void_request(p_void_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_user_id uuid := auth.uid();
  v_total_tokens int;
  v_redeemed_tokens int;
  v_real_type public.void_event_type;
  v_inv_resolution public.void_inventory_resolution;
  v_exec_mode public.void_execution_mode;
BEGIN
  -- Lock the request row
  SELECT * INTO v_req FROM void_requests WHERE id = p_void_request_id FOR UPDATE;
  
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  
  IF v_req.status != 'approved' THEN
    RAISE EXCEPTION 'Solo se pueden ejecutar solicitudes aprobadas';
  END IF;

  v_exec_mode := COALESCE(v_req.execution_mode, 'void_only');

  -- Recalculate REAL token state at execution time
  SELECT count(*), count(*) FILTER (WHERE status = 'redeemed')
  INTO v_total_tokens, v_redeemed_tokens
  FROM pickup_tokens
  WHERE sale_id = v_req.sale_id OR ticket_sale_id = v_req.sale_id;

  IF v_redeemed_tokens = 0 THEN
    -- PRE-REDEEM: cancel pending tokens, void sale
    v_real_type := 'void_pre_redeem';
    v_inv_resolution := 'none';

    UPDATE pickup_tokens
    SET status = 'cancelled'
    WHERE (sale_id = v_req.sale_id OR ticket_sale_id = v_req.sale_id)
      AND status = 'pending';

    UPDATE sales SET is_cancelled = true WHERE id = v_req.sale_id;

  ELSE
    -- POST-REDEEM: refund sale, handle inventory
    v_real_type := 'refund_post_redeem';

    -- Cancel any remaining pending tokens
    UPDATE pickup_tokens
    SET status = 'cancelled'
    WHERE (sale_id = v_req.sale_id OR ticket_sale_id = v_req.sale_id)
      AND status = 'pending';

    UPDATE sales SET is_cancelled = true WHERE id = v_req.sale_id;

    IF v_exec_mode = 'refund_with_inventory_return' THEN
      v_inv_resolution := 'returned_to_stock';
      -- Note: actual stock adjustment would be done via stock_movements by the admin
    ELSIF v_exec_mode = 'refund_with_loss' THEN
      v_inv_resolution := 'recognized_as_loss';
    ELSE
      v_inv_resolution := 'none';
    END IF;
  END IF;

  -- Create void_event audit record
  INSERT INTO void_events (venue_id, sale_id, void_request_id, event_type, inventory_resolution, reason, created_by, approved_by)
  VALUES (v_req.venue_id, v_req.sale_id, p_void_request_id, v_real_type, v_inv_resolution, v_req.reason, v_user_id, v_req.reviewed_by);

  -- Mark request as executed
  UPDATE void_requests
  SET status = 'executed', executed_at = now()
  WHERE id = p_void_request_id;
END;
$$;
