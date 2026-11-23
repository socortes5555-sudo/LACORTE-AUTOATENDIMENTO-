create unique index if not exists customers_active_email_unique_idx
  on public.customers (lower(btrim(email)))
  where email is not null and btrim(email) <> '' and deleted_at is null;
