CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_type text NOT NULL,
  opening_hours text,
  address text,
  wa_phone_number_id text UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  auth_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  phone text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  UNIQUE (shop_id, auth_id),
  UNIQUE (shop_id, phone)
);

CREATE INDEX users_auth_id_idx ON public.users (auth_id, shop_id);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  unit text NOT NULL,
  sell_price bigint NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  buy_price bigint NOT NULL DEFAULT 0 CHECK (buy_price >= 0),
  stock_qty numeric(14, 3) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  min_stock numeric(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  embedding extensions.vector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id)
);

CREATE INDEX products_shop_name_idx ON public.products (shop_id, name);


CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  phone text NOT NULL,
  name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  UNIQUE (shop_id, phone)
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  customer_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'open',
  handled_by text NOT NULL DEFAULT 'ai' CHECK (handled_by IN ('ai', 'owner')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id)
);

CREATE INDEX conversations_customer_idx ON public.conversations (shop_id, customer_id, last_message_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  conversation_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  wa_message_id text UNIQUE,
  type text NOT NULL CHECK (type IN ('text', 'image', 'audio', 'document', 'template')),
  body text,
  media_path text,
  transcript text,
  status text CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, conversation_id) REFERENCES public.conversations(shop_id, id)
);

CREATE INDEX messages_conversation_idx ON public.messages (shop_id, conversation_id, created_at DESC);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  customer_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'awaiting_payment', 'paid', 'processing', 'completed', 'cancelled')),
  total bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'dashboard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id)
);

CREATE INDEX orders_shop_status_idx ON public.orders (shop_id, status);
CREATE INDEX orders_customer_idx ON public.orders (shop_id, customer_id, created_at DESC);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, order_id) REFERENCES public.orders(shop_id, id),
  FOREIGN KEY (shop_id, product_id) REFERENCES public.products(shop_id, id)
);

CREATE INDEX order_items_order_idx ON public.order_items (shop_id, order_id);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  order_id uuid,
  total bigint NOT NULL CHECK (total >= 0),
  payment_method text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, order_id) REFERENCES public.orders(shop_id, id),
  FOREIGN KEY (shop_id, source_message_id) REFERENCES public.messages(shop_id, id)
);

CREATE UNIQUE INDEX sales_order_id_idx ON public.sales (shop_id, order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX sales_source_message_id_idx ON public.sales (shop_id, source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX sales_shop_occurred_at_idx ON public.sales (shop_id, occurred_at);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  description text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  category text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expenses_shop_occurred_at_idx ON public.expenses (shop_id, occurred_at);

CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  party_type text NOT NULL,
  party_name text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  paid_amount bigint NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  due_date date,
  status text NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'partial', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX debts_shop_status_idx ON public.debts (shop_id, status);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  name text NOT NULL,
  wa_phone text NOT NULL,
  products text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id)
);

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  supplier_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'sent', 'received', 'cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, supplier_id) REFERENCES public.suppliers(shop_id, id),
  FOREIGN KEY (shop_id, approved_by) REFERENCES public.users(shop_id, id)
);

CREATE INDEX purchase_orders_shop_status_idx ON public.purchase_orders (shop_id, status);
CREATE INDEX purchase_orders_supplier_idx ON public.purchase_orders (shop_id, supplier_id);

CREATE TABLE public.po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  po_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, po_id) REFERENCES public.purchase_orders(shop_id, id),
  FOREIGN KEY (shop_id, product_id) REFERENCES public.products(shop_id, id)
);

CREATE INDEX po_items_po_idx ON public.po_items (shop_id, po_id);

CREATE TABLE public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  order_id uuid NOT NULL,
  image_path text NOT NULL,
  image_hash text,
  extracted_amount bigint CHECK (extracted_amount >= 0),
  extracted_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'mismatched', 'needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, order_id) REFERENCES public.orders(shop_id, id)
);

CREATE INDEX payment_proofs_order_idx ON public.payment_proofs (shop_id, order_id);
CREATE INDEX payment_proofs_image_hash_idx ON public.payment_proofs (shop_id, image_hash) WHERE image_hash IS NOT NULL;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_shop_created_at_idx ON public.notifications (shop_id, created_at DESC);

CREATE TABLE public.agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  message_id uuid,
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  latency_ms integer CHECK (latency_ms >= 0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, message_id) REFERENCES public.messages(shop_id, id)
);

CREATE INDEX agent_logs_shop_created_at_idx ON public.agent_logs (shop_id, created_at DESC);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_shop_created_at_idx ON public.audit_logs (shop_id, created_at DESC);

CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  date date NOT NULL,
  ai_calls integer NOT NULL DEFAULT 0 CHECK (ai_calls >= 0),
  stt_calls integer NOT NULL DEFAULT 0 CHECK (stt_calls >= 0),
  ocr_calls integer NOT NULL DEFAULT 0 CHECK (ocr_calls >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, date)
);

CREATE FUNCTION private.is_shop_member(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.shop_id = target_shop_id AND u.auth_id = auth.uid()
  );
$$;

CREATE FUNCTION private.is_shop_owner(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.shop_id = target_shop_id AND u.auth_id = auth.uid() AND u.role = 'owner'
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_shop_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_shop_owner(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_shop_member(uuid), private.is_shop_owner(uuid) TO authenticated;

CREATE FUNCTION public.create_shop(shop_name text, shop_business_type text, owner_phone text, owner_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_shop_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NULLIF(btrim(shop_name), '') IS NULL
     OR NULLIF(btrim(shop_business_type), '') IS NULL
     OR NULLIF(btrim(owner_phone), '') IS NULL
     OR NULLIF(btrim(owner_name), '') IS NULL THEN
    RAISE EXCEPTION 'Shop and owner details are required';
  END IF;

  INSERT INTO public.shops (name, business_type)
  VALUES (shop_name, shop_business_type)
  RETURNING id INTO new_shop_id;

  INSERT INTO public.users (shop_id, auth_id, role, phone, name)
  VALUES (new_shop_id, auth.uid(), 'owner', owner_phone, owner_name);

  RETURN new_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shop(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shop(text, text, text, text) TO authenticated;

CREATE FUNCTION private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'shops', 'users', 'products', 'customers', 'conversations', 'messages',
    'orders', 'order_items', 'sales', 'expenses', 'debts', 'suppliers',
    'purchase_orders', 'po_items', 'payment_proofs', 'notifications',
    'agent_logs', 'audit_logs', 'usage_counters'
  ] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at()', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

CREATE POLICY shops_select ON public.shops FOR SELECT TO authenticated
  USING (private.is_shop_member(id));
CREATE POLICY shops_update ON public.shops FOR UPDATE TO authenticated
  USING (private.is_shop_owner(id)) WITH CHECK (private.is_shop_owner(id));

CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (private.is_shop_member(shop_id));
CREATE POLICY users_insert ON public.users FOR INSERT TO authenticated
  WITH CHECK (private.is_shop_owner(shop_id));
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
  USING (private.is_shop_owner(shop_id)) WITH CHECK (private.is_shop_owner(shop_id));
CREATE POLICY users_delete ON public.users FOR DELETE TO authenticated
  USING (private.is_shop_owner(shop_id));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'products', 'customers', 'conversations', 'messages', 'orders',
    'order_items', 'suppliers', 'payment_proofs', 'notifications'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_shop_member(shop_id))', table_name || '_select', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.is_shop_member(shop_id))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.is_shop_member(shop_id)) WITH CHECK (private.is_shop_member(shop_id))', table_name || '_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.is_shop_member(shop_id))', table_name || '_delete', table_name);
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sales', 'expenses', 'debts'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_shop_owner(shop_id))', table_name || '_select', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.is_shop_owner(shop_id))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.is_shop_owner(shop_id)) WITH CHECK (private.is_shop_owner(shop_id))', table_name || '_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.is_shop_owner(shop_id))', table_name || '_delete', table_name);
  END LOOP;
END;
$$;

CREATE POLICY purchase_orders_select ON public.purchase_orders FOR SELECT TO authenticated
  USING (private.is_shop_member(shop_id));
CREATE POLICY po_items_select ON public.po_items FOR SELECT TO authenticated
  USING (private.is_shop_member(shop_id));
REVOKE INSERT, UPDATE, DELETE ON public.purchase_orders, public.po_items FROM PUBLIC, anon, authenticated;

CREATE POLICY agent_logs_select ON public.agent_logs FOR SELECT TO authenticated
  USING (private.is_shop_owner(shop_id));
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (private.is_shop_owner(shop_id));
CREATE POLICY usage_counters_select ON public.usage_counters FOR SELECT TO authenticated
  USING (private.is_shop_owner(shop_id));
