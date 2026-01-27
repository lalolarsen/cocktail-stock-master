-- Insert all feature flag definitions into master table
INSERT INTO public.feature_flags_master (key, name, description, default_enabled)
VALUES
  ('ventas_alcohol', 'Ventas de Alcohol', 'Permite la venta de bebidas alcohólicas en barra', true),
  ('ventas_tickets', 'Ventas de Tickets', 'Módulo de venta de entradas/covers', false),
  ('qr_cover', 'QR Cover', 'Tokens de retiro de cover en barra', false),
  ('inventario', 'Inventario', 'Gestión de inventario y stock', true),
  ('reposicion', 'Reposición', 'Control de reposición entre ubicaciones', true),
  ('importacion_excel', 'Importación Excel', 'Importar facturas y documentos desde Excel', false),
  ('jornadas', 'Jornadas', 'Gestión de jornadas laborales', true),
  ('arqueo', 'Arqueo de Caja', 'Control y cierre de caja', true),
  ('reportes', 'Reportes', 'Acceso a reportes y estadísticas', true),
  ('contabilidad_basica', 'Contabilidad Básica', 'Ingresos, gastos y estado de resultados', true),
  ('contabilidad_avanzada', 'Contabilidad Avanzada', 'Facturación electrónica SII', false),
  ('lector_facturas', 'Lector de Facturas', 'OCR de documentos de compra', false)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Create an RPC to get venue flags efficiently (for client-side use)
CREATE OR REPLACE FUNCTION public.get_venue_flags(p_venue_id UUID)
RETURNS TABLE (
  flag_key TEXT,
  flag_name TEXT,
  description TEXT,
  enabled BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fm.key AS flag_key,
    fm.name AS flag_name,
    fm.description,
    COALESCE(
      (SELECT dff.is_enabled FROM developer_feature_flags dff 
       WHERE dff.venue_id = p_venue_id AND dff.key = fm.key),
      fm.default_enabled
    ) AS enabled
  FROM public.feature_flags_master fm
  ORDER BY fm.key;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_venue_flags(UUID) TO authenticated;

-- Update the dev_reset_flags_to_stable function to use new flags
CREATE OR REPLACE FUNCTION public.dev_reset_flags_to_stable(p_venue_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller has developer role
  IF NOT has_role(auth.uid(), 'developer'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: developer role required');
  END IF;

  -- Delete all existing flags for this venue
  DELETE FROM developer_feature_flags WHERE venue_id = p_venue_id;

  -- Insert stable v1.0 defaults (most basic features ON)
  INSERT INTO developer_feature_flags (venue_id, key, is_enabled, updated_by)
  VALUES 
    (p_venue_id, 'ventas_alcohol', true, auth.uid()),
    (p_venue_id, 'inventario', true, auth.uid()),
    (p_venue_id, 'jornadas', true, auth.uid()),
    (p_venue_id, 'arqueo', true, auth.uid()),
    (p_venue_id, 'reportes', true, auth.uid()),
    (p_venue_id, 'contabilidad_basica', true, auth.uid()),
    (p_venue_id, 'reposicion', true, auth.uid()),
    (p_venue_id, 'ventas_tickets', false, auth.uid()),
    (p_venue_id, 'qr_cover', false, auth.uid()),
    (p_venue_id, 'importacion_excel', false, auth.uid()),
    (p_venue_id, 'contabilidad_avanzada', false, auth.uid()),
    (p_venue_id, 'lector_facturas', false, auth.uid());

  -- Log the reset
  INSERT INTO developer_flag_audit (venue_id, key, from_enabled, to_enabled, changed_by)
  VALUES (p_venue_id, '__RESET_TO_STABLE__', null, true, auth.uid());

  RETURN jsonb_build_object('success', true, 'message', 'Flags reset to stable v1.0');
END;
$$;