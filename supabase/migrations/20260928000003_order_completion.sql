CREATE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shop_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_status NOT IN ('draft', 'awaiting_payment', 'processing', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported order status';
  END IF;

  SELECT shop_id INTO v_shop_id FROM public.orders WHERE id = p_order_id;
  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT private.is_shop_member(v_shop_id) THEN
    RAISE EXCEPTION 'Not a shop member';
  END IF;

  UPDATE public.orders
  SET status = p_status,
      payment_status = CASE WHEN p_status = 'cancelled' THEN 'cancelled' ELSE payment_status END
  WHERE id = p_order_id AND shop_id = v_shop_id;
END;
$$;

CREATE FUNCTION public.complete_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shop_id uuid;
  v_total bigint;
  v_status text;
  v_item_count integer;
  v_updated integer;
  v_sale_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT shop_id, total, status INTO v_shop_id, v_total, v_status
  FROM public.orders WHERE id = p_order_id;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT private.is_shop_owner(v_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can complete orders';
  END IF;
  IF v_status NOT IN ('awaiting_payment', 'processing', 'paid') THEN
    RAISE EXCEPTION 'Order is not ready to complete';
  END IF;

  INSERT INTO public.sales (shop_id, order_id, total, payment_method, occurred_at)
  VALUES (v_shop_id, p_order_id, v_total, 'tunai', now())
  RETURNING id INTO v_sale_id;

  SELECT count(*) INTO v_item_count FROM public.order_items WHERE order_id = p_order_id;
  IF v_item_count > 0 THEN
    UPDATE public.products AS p
    SET stock_qty = p.stock_qty - oi.qty
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id AND oi.product_id = p.id AND p.shop_id = v_shop_id AND p.stock_qty >= oi.qty;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_item_count THEN
      RAISE EXCEPTION 'Insufficient stock for one or more items';
    END IF;
  END IF;

  UPDATE public.orders
  SET status = 'completed', payment_status = 'paid'
  WHERE id = p_order_id AND shop_id = v_shop_id;

  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order(uuid) TO authenticated;

REVOKE UPDATE ON public.orders FROM PUBLIC, anon, authenticated;
