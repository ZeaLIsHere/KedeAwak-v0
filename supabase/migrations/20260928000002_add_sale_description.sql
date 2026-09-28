ALTER TABLE public.sales
  ADD COLUMN description text,
  ADD CONSTRAINT sales_description_length_check CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 120);

ALTER TABLE public.sales
  ALTER COLUMN payment_method SET DEFAULT 'tunai';
