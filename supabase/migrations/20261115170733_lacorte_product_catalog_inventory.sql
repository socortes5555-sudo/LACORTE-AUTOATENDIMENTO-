-- LaCorte: catálogo administrativo de produtos e estoque com histórico append-only.
-- Migração aditiva: não altera serviços, filas, pagamentos ou registros existentes.

create table if not exists public.lacorte_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 100),
  description text check (description is null or pg_catalog.char_length(description) <= 240),
  sku text check (sku is null or pg_catalog.char_length(pg_catalog.btrim(sku)) between 1 and 40),
  price numeric(10,2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index if not exists lacorte_products_sku_unique
  on public.lacorte_products (pg_catalog.lower(pg_catalog.btrim(sku)))
  where sku is not null;

create index if not exists lacorte_products_active_name_idx
  on public.lacorte_products (active, name);

create table if not exists public.lacorte_product_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lacorte_products(id) on delete restrict,
  quantity_delta integer not null check (quantity_delta <> 0 and quantity_delta between -100000 and 100000),
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 3 and 200),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists lacorte_product_stock_movements_product_created_idx
  on public.lacorte_product_stock_movements (product_id, created_at desc);

alter table public.lacorte_products enable row level security;
revoke all on table public.lacorte_products from public, anon, authenticated;
grant select on table public.lacorte_products to authenticated;
grant insert (name, description, sku, price, active) on table public.lacorte_products to authenticated;
grant update (name, description, sku, price, active) on table public.lacorte_products to authenticated;

do $policies$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lacorte_products'
      and policyname = 'lacorte_products_admin_read'
  ) then
    create policy lacorte_products_admin_read on public.lacorte_products
      for select to authenticated using (private.is_lacorte_admin());
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lacorte_products'
      and policyname = 'lacorte_products_admin_insert'
  ) then
    create policy lacorte_products_admin_insert on public.lacorte_products
      for insert to authenticated with check (private.is_lacorte_admin());
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lacorte_products'
      and policyname = 'lacorte_products_admin_update'
  ) then
    create policy lacorte_products_admin_update on public.lacorte_products
      for update to authenticated
      using (private.is_lacorte_admin())
      with check (private.is_lacorte_admin());
  end if;
end;
$policies$;

alter table public.lacorte_product_stock_movements enable row level security;
revoke all on table public.lacorte_product_stock_movements from public, anon, authenticated;
grant select on table public.lacorte_product_stock_movements to authenticated;

do $movement_policy$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lacorte_product_stock_movements'
      and policyname = 'lacorte_product_stock_movements_admin_read'
  ) then
    create policy lacorte_product_stock_movements_admin_read
      on public.lacorte_product_stock_movements
      for select to authenticated
      using (private.is_lacorte_admin());
  end if;
end;
$movement_policy$;

create or replace function private.lacorte_products_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $trigger$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$trigger$;

do $touch_trigger$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.lacorte_products'::regclass
      and tgname = 'lacorte_products_touch_updated_at'
      and not tgisinternal
  ) then
    create trigger lacorte_products_touch_updated_at
      before update on public.lacorte_products
      for each row execute function private.lacorte_products_touch_updated_at();
  end if;
end;
$touch_trigger$;

create or replace function private.lacorte_admin_adjust_product_stock_internal(
  p_product_id uuid,
  p_quantity_delta integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_stock integer;
  v_new_stock integer;
  v_reason text;
begin
  if auth.uid() is null or not private.is_lacorte_admin() then
    raise exception 'Somente o administrador pode movimentar o estoque.';
  end if;

  if p_product_id is null
     or p_quantity_delta is null
     or p_quantity_delta = 0
     or p_quantity_delta < -100000
     or p_quantity_delta > 100000 then
    raise exception 'Informe um produto e uma quantidade inteira válida.';
  end if;

  v_reason := pg_catalog.btrim(coalesce(p_reason, ''));
  if pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 200 then
    raise exception 'Informe um motivo entre 3 e 200 caracteres.';
  end if;

  select stock_quantity
    into v_current_stock
  from public.lacorte_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.';
  end if;

  v_new_stock := v_current_stock + p_quantity_delta;
  if v_new_stock < 0 then
    raise exception 'A saída informada é maior que o estoque disponível.';
  end if;

  update public.lacorte_products
  set stock_quantity = v_new_stock
  where id = p_product_id;

  insert into public.lacorte_product_stock_movements (
    product_id, quantity_delta, reason, created_by
  ) values (
    p_product_id, p_quantity_delta, v_reason, auth.uid()
  );

  return v_new_stock;
end;
$function$;

create or replace function public.lacorte_admin_adjust_product_stock(
  p_product_id uuid,
  p_quantity_delta integer,
  p_reason text
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.lacorte_admin_adjust_product_stock_internal(
    p_product_id, p_quantity_delta, p_reason
  );
$function$;

revoke all on function private.lacorte_admin_adjust_product_stock_internal(uuid, integer, text) from public, anon;
grant execute on function private.lacorte_admin_adjust_product_stock_internal(uuid, integer, text) to authenticated;

revoke all on function public.lacorte_admin_adjust_product_stock(uuid, integer, text) from public, anon;
grant execute on function public.lacorte_admin_adjust_product_stock(uuid, integer, text) to authenticated;
