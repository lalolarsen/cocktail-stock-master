-- Tabla para configurar items del sidebar por venue y rol
CREATE TABLE public.sidebar_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'gerencia', 'vendedor', 'bar', 'ticket_seller')),
  menu_key text NOT NULL,
  menu_label text NOT NULL,
  icon_name text NOT NULL DEFAULT 'Wine',
  view_type text NOT NULL,
  feature_flag text,
  external_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, role, menu_key)
);

-- Enable RLS
ALTER TABLE public.sidebar_config ENABLE ROW LEVEL SECURITY;

-- Política: developers pueden ver y editar todo
CREATE POLICY "Developers can manage sidebar config"
ON public.sidebar_config
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'developer'
  )
);

-- Política: usuarios pueden leer config de su venue
CREATE POLICY "Users can read their venue sidebar config"
ON public.sidebar_config
FOR SELECT
TO authenticated
USING (
  venue_id IN (
    SELECT venue_id FROM profiles WHERE id = auth.uid()
  )
);

-- RPC para obtener sidebar config con defaults
CREATE OR REPLACE FUNCTION public.get_sidebar_config(p_venue_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Obtener config del venue, si no existe retornar array vacío (usa defaults del frontend)
  SELECT jsonb_agg(
    jsonb_build_object(
      'menu_key', menu_key,
      'menu_label', menu_label,
      'icon_name', icon_name,
      'view_type', view_type,
      'feature_flag', feature_flag,
      'external_path', external_path,
      'sort_order', sort_order,
      'is_enabled', is_enabled
    ) ORDER BY sort_order
  )
  INTO result
  FROM sidebar_config
  WHERE venue_id = p_venue_id 
    AND role = p_role
    AND is_enabled = true;
    
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- RPC para guardar sidebar config (developer only)
CREATE OR REPLACE FUNCTION public.dev_save_sidebar_config(
  p_venue_id uuid,
  p_role text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calling_user_id uuid := auth.uid();
  is_dev boolean;
  item jsonb;
  sort_idx integer := 0;
BEGIN
  -- Verificar developer
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = calling_user_id 
    AND role = 'developer'
  ) INTO is_dev;
  
  IF NOT is_dev THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only developers can edit sidebar config');
  END IF;
  
  -- Eliminar config existente para este venue/rol
  DELETE FROM sidebar_config WHERE venue_id = p_venue_id AND role = p_role;
  
  -- Insertar nuevos items
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sidebar_config (
      venue_id, role, menu_key, menu_label, icon_name, view_type, 
      feature_flag, external_path, sort_order, is_enabled
    ) VALUES (
      p_venue_id,
      p_role,
      item->>'menu_key',
      item->>'menu_label',
      COALESCE(item->>'icon_name', 'Wine'),
      item->>'view_type',
      NULLIF(item->>'feature_flag', ''),
      NULLIF(item->>'external_path', ''),
      sort_idx,
      COALESCE((item->>'is_enabled')::boolean, true)
    );
    sort_idx := sort_idx + 1;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'items_saved', sort_idx);
END;
$$;