-- Factory Reset function: deletes ALL non-demo data while preserving demo venue
CREATE OR REPLACE FUNCTION public.factory_reset_non_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_demo_venue_ids UUID[];
  v_demo_profile_ids UUID[];
  v_deleted_counts JSONB := '{}'::JSONB;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  -- Check admin permission
  IF NOT has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized - admin only');
  END IF;
  
  -- Get demo venue IDs
  SELECT ARRAY_AGG(id) INTO v_demo_venue_ids FROM venues WHERE is_demo = true;
  
  -- Guard: must have at least one demo venue
  IF v_demo_venue_ids IS NULL OR array_length(v_demo_venue_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No demo venue found. Cannot proceed with factory reset.');
  END IF;
  
  -- Get demo profile IDs (profiles linked to demo venues)
  SELECT ARRAY_AGG(id) INTO v_demo_profile_ids FROM profiles WHERE venue_id = ANY(v_demo_venue_ids);
  IF v_demo_profile_ids IS NULL THEN
    v_demo_profile_ids := ARRAY[]::UUID[];
  END IF;
  
  -- Log the reset action BEFORE deleting
  INSERT INTO admin_audit_logs (admin_id, action, details)
  VALUES (v_user_id, 'factory_reset', jsonb_build_object(
    'demo_venues_preserved', v_demo_venue_ids,
    'demo_profiles_preserved', v_demo_profile_ids,
    'timestamp', now()
  ));
  
  -- DELETE IN FK-SAFE ORDER (children first, then parents)
  
  -- 1. notification_logs (venue-scoped)
  DELETE FROM notification_logs WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('notification_logs', v_count);
  
  -- 2. sales_documents (via sales -> venue_id)
  DELETE FROM sales_documents WHERE sale_id IN (
    SELECT id FROM sales WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sales_documents', v_count);
  
  -- 3. pickup_redemptions_log (via pickup_tokens -> sales -> venue_id)
  DELETE FROM pickup_redemptions_log WHERE pickup_token_id IN (
    SELECT pt.id FROM pickup_tokens pt
    JOIN sales s ON s.id = pt.sale_id
    WHERE s.venue_id IS NULL OR NOT (s.venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pickup_redemptions_log', v_count);
  
  -- 4. pickup_tokens (via sales -> venue_id)
  DELETE FROM pickup_tokens WHERE sale_id IN (
    SELECT id FROM sales WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pickup_tokens', v_count);
  
  -- 5. sale_items (via sales -> venue_id)
  DELETE FROM sale_items WHERE sale_id IN (
    SELECT id FROM sales WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sale_items', v_count);
  
  -- 6. sales (venue-scoped)
  DELETE FROM sales WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sales', v_count);
  
  -- 7. expenses (via jornadas -> venue_id)
  DELETE FROM expenses WHERE jornada_id IN (
    SELECT id FROM jornadas WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('expenses', v_count);
  
  -- 8. cash_registers (via jornadas -> venue_id)
  DELETE FROM cash_registers WHERE jornada_id IN (
    SELECT id FROM jornadas WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cash_registers', v_count);
  
  -- 9. stock_transfer_items (via stock_transfers -> locations -> venue_id)
  DELETE FROM stock_transfer_items WHERE transfer_id IN (
    SELECT st.id FROM stock_transfers st
    JOIN stock_locations sl ON sl.id = st.from_location_id
    WHERE sl.venue_id IS NULL OR NOT (sl.venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_transfer_items', v_count);
  
  -- 10. stock_transfers (via locations -> venue_id)
  DELETE FROM stock_transfers WHERE from_location_id IN (
    SELECT id FROM stock_locations WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_transfers', v_count);
  
  -- 11. stock_movements (via products -> venue_id OR locations -> venue_id)
  DELETE FROM stock_movements WHERE product_id IN (
    SELECT id FROM products WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_movements', v_count);
  
  -- 12. stock_balances (via products -> venue_id OR locations -> venue_id)
  DELETE FROM stock_balances WHERE product_id IN (
    SELECT id FROM products WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  ) OR location_id IN (
    SELECT id FROM stock_locations WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_balances', v_count);
  
  -- 13. stock_alerts (via products -> venue_id)
  DELETE FROM stock_alerts WHERE product_id IN (
    SELECT id FROM products WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_alerts', v_count);
  
  -- 14. stock_predictions (via products -> venue_id)
  DELETE FROM stock_predictions WHERE product_id IN (
    SELECT id FROM products WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_predictions', v_count);
  
  -- 15. replenishment_plan_items (via replenishment_plans -> jornadas -> venue_id)
  DELETE FROM replenishment_plan_items WHERE replenishment_plan_id IN (
    SELECT rp.id FROM replenishment_plans rp
    JOIN jornadas j ON j.id = rp.jornada_id
    WHERE j.venue_id IS NULL OR NOT (j.venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('replenishment_plan_items', v_count);
  
  -- 16. replenishment_plans (via jornadas -> venue_id)
  DELETE FROM replenishment_plans WHERE jornada_id IN (
    SELECT id FROM jornadas WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('replenishment_plans', v_count);
  
  -- 17. login_history (via user_id -> profiles -> venue_id)
  DELETE FROM login_history WHERE user_id NOT IN (
    SELECT id FROM profiles WHERE venue_id = ANY(v_demo_venue_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_history', v_count);
  
  -- 18. login_attempts (venue-scoped)
  DELETE FROM login_attempts WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_attempts', v_count);
  
  -- 19. jornadas (venue-scoped)
  DELETE FROM jornadas WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('jornadas', v_count);
  
  -- 20. cocktail_ingredients (via cocktails -> venue_id)
  DELETE FROM cocktail_ingredients WHERE cocktail_id IN (
    SELECT id FROM cocktails WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cocktail_ingredients', v_count);
  
  -- 21. cocktails (venue-scoped)
  DELETE FROM cocktails WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cocktails', v_count);
  
  -- 22. products (venue-scoped)
  DELETE FROM products WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('products', v_count);
  
  -- 23. pos_terminals (venue-scoped)
  DELETE FROM pos_terminals WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pos_terminals', v_count);
  
  -- 24. stock_locations (venue-scoped)
  DELETE FROM stock_locations WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('stock_locations', v_count);
  
  -- 25. notification_preferences (venue-scoped or worker-scoped)
  DELETE FROM notification_preferences WHERE venue_id IS NULL OR NOT (venue_id = ANY(v_demo_venue_ids))
    OR (worker_id IS NOT NULL AND NOT (worker_id = ANY(v_demo_profile_ids)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('notification_preferences', v_count);
  
  -- 26. worker_roles (non-demo workers)
  DELETE FROM worker_roles WHERE NOT (worker_id = ANY(v_demo_profile_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('worker_roles', v_count);
  
  -- 27. user_roles (non-demo users)
  DELETE FROM user_roles WHERE NOT (user_id = ANY(v_demo_profile_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_roles', v_count);
  
  -- 28. profiles (non-demo only) - Note: we can't delete auth.users, but we remove their profiles
  -- This effectively orphans any non-demo auth.users, they won't be able to login properly
  DELETE FROM profiles WHERE NOT (venue_id = ANY(v_demo_venue_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles', v_count);
  
  -- 29. venues (non-demo only)
  DELETE FROM venues WHERE NOT is_demo;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('venues', v_count);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Factory reset completed. All non-demo data has been deleted.',
    'demo_venues_preserved', v_demo_venue_ids,
    'deleted_counts', v_deleted_counts,
    'executed_at', now()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;