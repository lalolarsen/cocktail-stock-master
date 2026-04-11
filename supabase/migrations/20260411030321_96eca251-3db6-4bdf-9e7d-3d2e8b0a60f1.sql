CREATE OR REPLACE FUNCTION public.redeem_courtesy_qr(
  p_code text,
  p_jornada_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_qr public.courtesy_qr%ROWTYPE;
  v_venue_id uuid;
  v_new_used_count integer;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNAUTHENTICATED',
      'message', 'Debes iniciar sesión'
    );
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
    OR public.has_role(auth.uid(), 'vendedor'::public.app_role)
    OR public.has_role(auth.uid(), 'bar'::public.app_role)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'FORBIDDEN',
      'message', 'No tienes permisos para canjear cortesías'
    );
  END IF;

  v_venue_id := public.get_user_venue_id();

  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VENUE_NOT_FOUND',
      'message', 'No se pudo resolver el local del usuario'
    );
  END IF;

  v_code := lower(
    trim(
      regexp_replace(coalesce(p_code, ''), '^COURTESY[:\-\s;.]?', '', 'i')
    )
  );

  IF v_code = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_NOT_FOUND',
      'message', 'QR cortesía no encontrado'
    );
  END IF;

  SELECT *
  INTO v_qr
  FROM public.courtesy_qr
  WHERE code = v_code
    AND venue_id = v_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_NOT_FOUND',
      'message', 'QR cortesía no encontrado'
    );
  END IF;

  IF v_qr.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_CANCELLED',
      'message', 'QR cancelado'
    );
  END IF;

  IF v_qr.status = 'expired' OR v_qr.expires_at < now() THEN
    UPDATE public.courtesy_qr
    SET status = 'expired'
    WHERE id = v_qr.id
      AND status <> 'expired';

    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_EXPIRED',
      'message', 'QR cortesía expirado'
    );
  END IF;

  IF v_qr.status = 'redeemed' OR v_qr.used_count >= v_qr.max_uses THEN
    UPDATE public.courtesy_qr
    SET status = 'redeemed'
    WHERE id = v_qr.id
      AND status <> 'redeemed';

    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_REDEEMED',
      'message', 'QR ya canjeado'
    );
  END IF;

  v_new_used_count := v_qr.used_count + 1;
  v_new_status := CASE
    WHEN v_new_used_count >= v_qr.max_uses THEN 'redeemed'
    ELSE 'active'
  END;

  UPDATE public.courtesy_qr
  SET used_count = v_new_used_count,
      status = v_new_status
  WHERE id = v_qr.id;

  IF p_jornada_id IS NOT NULL THEN
    INSERT INTO public.courtesy_redemptions (
      courtesy_id,
      jornada_id,
      redeemed_by,
      venue_id,
      result
    )
    VALUES (
      v_qr.id,
      p_jornada_id,
      auth.uid(),
      v_venue_id,
      'success'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deliver', jsonb_build_object(
      'type', 'cover',
      'name', concat('🎁 ', v_qr.product_name),
      'quantity', v_qr.qty
    ),
    'courtesy', jsonb_build_object(
      'code', v_qr.code,
      'product_name', v_qr.product_name,
      'qty', v_qr.qty,
      'used_count', v_new_used_count,
      'max_uses', v_qr.max_uses,
      'status', v_new_status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_courtesy_qr(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_courtesy_qr(text, uuid) TO authenticated;