-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.reset_venue_data(uuid, uuid[]);

-- Create comprehensive venue reset RPC
CREATE OR REPLACE FUNCTION public.reset_venue_data(
  p_venue_id uuid,
  p_keep_user_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_user_id uuid;
BEGIN
  -- Security check: only developers can run this
  IF NOT has_role(auth.uid(), 'developer') THEN
    RAISE EXCEPTION 'Only developers can reset venue data';
  END IF;

  -- Verify venue exists
  IF NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'Venue not found: %', p_venue_id;
  END IF;

  -- Get current user for audit
  v_user_id := auth.uid();

  -- Start cleaning in FK order (children first)
  
  -- 1. Pickup redemptions log
  DELETE FROM pickup_redemptions_log 
  WHERE pickup_token_id IN (SELECT id FROM pickup_tokens WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pickup_redemptions_log', v_count);

  -- 2. Pickup tokens
  DELETE FROM pickup_tokens WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pickup_tokens', v_count);

  -- 3. Stock movements
  DELETE FROM stock_movements 
  WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = p_venue_id)
     OR from_location_id IN (SELECT id FROM stock_locations WHERE venue_id = p_venue_id)
     OR to_location_id IN (SELECT id FROM stock_locations WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_movements', v_count);

  -- 4. Sale items (via sales)
  DELETE FROM sale_items 
  WHERE sale_id IN (SELECT id FROM sales WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sale_items', v_count);

  -- 5. Sales
  DELETE FROM sales WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sales', v_count);

  -- 6. Ticket sale items
  DELETE FROM ticket_sale_items 
  WHERE ticket_sale_id IN (SELECT id FROM ticket_sales WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('ticket_sale_items', v_count);

  -- 7. Ticket sales
  DELETE FROM ticket_sales WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('ticket_sales', v_count);

  -- 8. Jornada cash closings
  DELETE FROM jornada_cash_closings WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornada_cash_closings', v_count);

  -- 9. Jornada cash openings
  DELETE FROM jornada_cash_openings WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornada_cash_openings', v_count);

  -- 10. Jornada financial summary
  DELETE FROM jornada_financial_summary WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornada_financial_summary', v_count);

  -- 11. Jornada audit log
  DELETE FROM jornada_audit_log WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornada_audit_log', v_count);

  -- 12. Expenses
  DELETE FROM expenses WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('expenses', v_count);

  -- 13. Gross income entries
  DELETE FROM gross_income_entries WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('gross_income_entries', v_count);

  -- 14. Jornadas
  DELETE FROM jornadas WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornadas', v_count);

  -- 15. Stock balances
  DELETE FROM stock_balances 
  WHERE location_id IN (SELECT id FROM stock_locations WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_balances', v_count);

  -- 16. Stock transfer items
  DELETE FROM stock_transfer_items 
  WHERE transfer_id IN (
    SELECT id FROM stock_transfers 
    WHERE from_location_id IN (SELECT id FROM stock_locations WHERE venue_id = p_venue_id)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_transfer_items', v_count);

  -- 17. Stock transfers
  DELETE FROM stock_transfers 
  WHERE from_location_id IN (SELECT id FROM stock_locations WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_transfers', v_count);

  -- 18. Replenishment plan items
  DELETE FROM replenishment_plan_items 
  WHERE replenishment_plan_id IN (
    SELECT id FROM replenishment_plans 
    WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = p_venue_id)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('replenishment_plan_items', v_count);

  -- 19. Replenishment plans
  DELETE FROM replenishment_plans 
  WHERE jornada_id IN (SELECT id FROM jornadas WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('replenishment_plans', v_count);

  -- 20. Cocktail ingredients
  DELETE FROM cocktail_ingredients 
  WHERE cocktail_id IN (SELECT id FROM cocktails WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cocktail_ingredients', v_count);

  -- 21. Cocktails
  DELETE FROM cocktails WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cocktails', v_count);

  -- 22. Product name mappings
  DELETE FROM product_name_mappings WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('product_name_mappings', v_count);

  -- 23. Provider product mappings
  DELETE FROM provider_product_mappings WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('provider_product_mappings', v_count);

  -- 24. Purchase items (via documents)
  DELETE FROM purchase_items 
  WHERE purchase_document_id IN (SELECT id FROM purchase_documents WHERE venue_id = p_venue_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('purchase_items', v_count);

  -- 25. Purchase documents
  DELETE FROM purchase_documents WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('purchase_documents', v_count);

  -- 26. Products
  DELETE FROM products WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('products', v_count);

  -- 27. POS terminals
  DELETE FROM pos_terminals WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pos_terminals', v_count);

  -- 28. Stock locations (bars/bodegas)
  DELETE FROM stock_locations WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_locations', v_count);

  -- 29. Ticket types
  DELETE FROM ticket_types WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('ticket_types', v_count);

  -- 30. Notification logs
  DELETE FROM notification_logs WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('notification_logs', v_count);

  -- 31. Notification preferences
  DELETE FROM notification_preferences WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('notification_preferences', v_count);

  -- 32. Login attempts
  DELETE FROM login_attempts WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_attempts', v_count);

  -- 33. App audit events
  DELETE FROM app_audit_events WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('app_audit_events', v_count);

  -- 34. App error logs
  DELETE FROM app_error_logs WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('app_error_logs', v_count);

  -- 35. Demo event logs
  DELETE FROM demo_event_logs WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('demo_event_logs', v_count);

  -- 36. Jornada cash settings (reset to defaults, don't delete)
  DELETE FROM jornada_cash_settings WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornada_cash_settings', v_count);

  -- 37. Jornada cash pos defaults
  DELETE FROM jornada_cash_pos_defaults WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornada_cash_pos_defaults', v_count);

  -- 38. Worker roles (keep protected users)
  DELETE FROM worker_roles 
  WHERE venue_id = p_venue_id 
    AND worker_id != ALL(p_keep_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('worker_roles', v_count);

  -- 39. Sidebar config
  DELETE FROM sidebar_config WHERE venue_id = p_venue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sidebar_config', v_count);

  -- 40. Feature flags - delete and reinsert defaults
  DELETE FROM feature_flags WHERE venue_id = p_venue_id;
  DELETE FROM developer_feature_flags WHERE venue_id = p_venue_id;
  DELETE FROM venue_feature_flags WHERE venue_id = p_venue_id;
  
  -- Insert default v1.0 flags
  INSERT INTO feature_flags (venue_id, feature_key, enabled) VALUES
    (p_venue_id, 'jornadas', true),
    (p_venue_id, 'ventas_alcohol', true),
    (p_venue_id, 'ventas_tickets', true),
    (p_venue_id, 'qr_cover', true),
    (p_venue_id, 'inventario', true),
    (p_venue_id, 'reposicion', false),
    (p_venue_id, 'lector_facturas', false),
    (p_venue_id, 'reportes', true),
    (p_venue_id, 'contabilidad_basica', true),
    (p_venue_id, 'contabilidad_avanzada', false)
  ON CONFLICT (venue_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;
  
  v_deleted_counts := v_deleted_counts || jsonb_build_object('feature_flags_reset', true);

  -- Record audit log
  INSERT INTO admin_audit_logs (admin_id, action, details)
  VALUES (
    v_user_id,
    'venue_full_reset',
    jsonb_build_object(
      'venue_id', p_venue_id,
      'keep_user_ids', p_keep_user_ids,
      'deleted_counts', v_deleted_counts,
      'ran_at', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'deleted_counts', v_deleted_counts
  );
END;
$$;

-- Grant execute to authenticated users (RPC checks role internally)
GRANT EXECUTE ON FUNCTION public.reset_venue_data(uuid, uuid[]) TO authenticated;