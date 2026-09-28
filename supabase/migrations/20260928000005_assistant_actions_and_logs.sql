CREATE TABLE public.assistant_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  user_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('create_expense', 'create_sale')),
  payload jsonb NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, user_id) REFERENCES public.users(shop_id, id)
);

CREATE INDEX assistant_pending_actions_open_idx
  ON public.assistant_pending_actions (shop_id, user_id, status, expires_at DESC);

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.assistant_pending_actions
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.assistant_pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY assistant_pending_actions_select ON public.assistant_pending_actions FOR SELECT TO authenticated
  USING (private.is_shop_owner(shop_id));
CREATE POLICY assistant_pending_actions_insert ON public.assistant_pending_actions FOR INSERT TO authenticated
  WITH CHECK (private.is_shop_owner(shop_id));
CREATE POLICY assistant_pending_actions_update ON public.assistant_pending_actions FOR UPDATE TO authenticated
  USING (private.is_shop_owner(shop_id)) WITH CHECK (private.is_shop_owner(shop_id));

-- MARK: Staff may use read tools too, so their calls must reach the audit log and quota counter
CREATE POLICY agent_logs_insert ON public.agent_logs FOR INSERT TO authenticated
  WITH CHECK (private.is_shop_member(shop_id));

CREATE POLICY usage_counters_insert ON public.usage_counters FOR INSERT TO authenticated
  WITH CHECK (private.is_shop_member(shop_id));
CREATE POLICY usage_counters_update ON public.usage_counters FOR UPDATE TO authenticated
  USING (private.is_shop_member(shop_id)) WITH CHECK (private.is_shop_member(shop_id));
