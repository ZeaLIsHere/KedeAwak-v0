CREATE UNIQUE INDEX users_one_shop_per_auth_id_idx ON public.users (auth_id);

ALTER TABLE public.shops
  ADD CONSTRAINT shops_name_length_check CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  ADD CONSTRAINT shops_business_type_length_check CHECK (length(btrim(business_type)) BETWEEN 1 AND 80);

ALTER TABLE public.users
  ADD CONSTRAINT users_name_length_check CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  ADD CONSTRAINT users_phone_e164_check CHECK (phone ~ '^[+][1-9][0-9]{7,14}$');
