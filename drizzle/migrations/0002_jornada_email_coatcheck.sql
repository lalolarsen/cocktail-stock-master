-- Añade el resumen de guardarropía al correo de cierre de jornada,
-- parchando el cuerpo existente de dispatch_jornada_closed_email.
DO $do$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'dispatch_jornada_closed_email'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'dispatch_jornada_closed_email not found';
  END IF;

  IF position('v_coatcheck' in v_src) > 0 THEN
    RETURN; -- ya parchado
  END IF;

  -- 1. Declarar variable
  v_src := replace(
    v_src,
    E'  v_ingredient_usage jsonb := ''[]''::jsonb;',
    E'  v_ingredient_usage jsonb := ''[]''::jsonb;\n  v_coatcheck jsonb := ''{}''::jsonb;'
  );

  -- 2. Calcular guardarropía antes de resolver la URL del proyecto
  v_src := replace(
    v_src,
    E'  IF v_supabase_url IS NULL OR v_supabase_url = '''' THEN',
    E'  BEGIN\n'
    || E'    SELECT jsonb_build_object(\n'
    || E'      ''total'', COALESCE(SUM(amount), 0),\n'
    || E'      ''cash'', COALESCE(SUM(amount) FILTER (WHERE payment_method = ''cash''), 0),\n'
    || E'      ''card'', COALESCE(SUM(amount) FILTER (WHERE payment_method <> ''cash''), 0),\n'
    || E'      ''tickets'', COALESCE(COUNT(*), 0),\n'
    || E'      ''garments'', COALESCE(SUM(garment_count), 0),\n'
    || E'      ''pending'', COALESCE(COUNT(*) FILTER (WHERE status = ''issued''), 0)\n'
    || E'    ) INTO v_coatcheck\n'
    || E'    FROM coatcheck_tickets\n'
    || E'    WHERE jornada_id = p_jornada_id AND status <> ''cancelled'';\n'
    || E'  EXCEPTION WHEN OTHERS THEN\n'
    || E'    RAISE WARNING ''coatcheck summary failed: %'', SQLERRM;\n'
    || E'    v_coatcheck := ''{}''::jsonb;\n'
    || E'  END;\n\n'
    || E'  IF v_supabase_url IS NULL OR v_supabase_url = '''' THEN'
  );

  -- 3. Incluirlo en el payload del correo
  v_src := replace(
    v_src,
    E'        ''waste_summary'', v_waste_summary',
    E'        ''waste_summary'', v_waste_summary,\n        ''coatcheck'', v_coatcheck'
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.dispatch_jornada_closed_email(p_jornada_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_src
  );
END
$do$;