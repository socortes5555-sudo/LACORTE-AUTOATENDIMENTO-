-- LaCorte: produtos na comanda, baixa atômica do estoque e comissão configurável.
-- Os produtos só são gravados e baixados quando o pagamento é confirmado.
-- Se o fechamento falhar, a transação reverte itens, estoque e movimentações.

alter table public.lacorte_products
  add column if not exists commission_percent numeric(5,2) not null default 0
  check (commission_percent >= 0 and commission_percent <= 100);

grant insert (commission_percent) on table public.lacorte_products to authenticated;
grant update (commission_percent) on table public.lacorte_products to authenticated;

create or replace function private.is_lacorte_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_lacorte_admin()
    or exists (
      select 1
      from public.lacorte_user_roles r
      join public.barbers b on b.id = r.barber_id
      where r.user_id = auth.uid()
        and r.role = 'barber'
        and b.active = true
    );
$function$;

revoke all on function private.is_lacorte_staff() from public, anon;
grant execute on function private.is_lacorte_staff() to authenticated;

do $product_read_policy$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='lacorte_products'
      and policyname='lacorte_products_staff_read'
  ) then
    create policy lacorte_products_staff_read
      on public.lacorte_products
      for select to authenticated
      using (private.is_lacorte_staff());
  end if;
end;
$product_read_policy$;

create table if not exists public.lacorte_queue_product_items (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.lacorte_queue(id) on delete restrict,
  product_id uuid not null references public.lacorte_products(id) on delete restrict,
  product_name_snapshot text not null check (pg_catalog.char_length(pg_catalog.btrim(product_name_snapshot)) between 1 and 100),
  sku_snapshot text check (sku_snapshot is null or pg_catalog.char_length(sku_snapshot) <= 40),
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  commission_percent_snapshot numeric(5,2) not null default 0
    check (commission_percent_snapshot between 0 and 100),
  added_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  unique (queue_id, product_id)
);

create index if not exists lacorte_queue_product_items_queue_idx
  on public.lacorte_queue_product_items (queue_id, created_at);

alter table public.lacorte_queue_product_items enable row level security;
revoke all on table public.lacorte_queue_product_items from public, anon, authenticated;
grant select on table public.lacorte_queue_product_items to authenticated;

do $queue_product_policy$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='lacorte_queue_product_items'
      and policyname='lacorte_queue_product_items_staff_read'
  ) then
    create policy lacorte_queue_product_items_staff_read
      on public.lacorte_queue_product_items
      for select to authenticated
      using (
        exists (
          select 1
          from public.lacorte_queue q
          where q.id = lacorte_queue_product_items.queue_id
            and (private.is_lacorte_admin() or private.is_lacorte_barber(q.barber_id))
        )
      );
  end if;
end;
$queue_product_policy$;

create or replace function private.lacorte_finish_service_details_with_products_internal(
  p_queue_id uuid,
  p_discount_amount numeric,
  p_payments jsonb,
  p_observation text,
  p_products jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queue public.lacorte_queue%rowtype;
  v_product public.lacorte_products%rowtype;
  v_line jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_line_total numeric(10,2);
  v_service_gross numeric(10,2);
  v_product_gross numeric(10,2) := 0;
  v_product_commission numeric(10,2) := 0;
  v_total_gross numeric(10,2);
  v_discount numeric(10,2);
  v_net numeric(10,2);
  v_commission_factor numeric(12,8);
  v_product_count integer;
  v_distinct_count integer;
  v_ticket text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_queue
  from public.lacorte_queue
  where id = p_queue_id and status = 'in_progress'
  for update;

  if not found then
    raise exception 'Atendimento não está em andamento.';
  end if;

  if not (private.is_lacorte_admin() or private.is_lacorte_barber(v_queue.barber_id)) then
    raise exception 'Você não tem permissão para finalizar este atendimento.';
  end if;

  if jsonb_typeof(p_products) is distinct from 'array' then
    raise exception 'A lista de produtos da comanda é inválida.';
  end if;

  select count(*) into v_product_count
  from jsonb_array_elements(p_products);

  if v_product_count > 30 then
    raise exception 'Adicione no máximo 30 produtos diferentes por comanda.';
  end if;

  select count(distinct value->>'product_id') into v_distinct_count
  from jsonb_array_elements(p_products);

  if v_product_count <> v_distinct_count then
    raise exception 'Não repita o mesmo produto na comanda.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_products) entry(value)
    where jsonb_typeof(value) is distinct from 'object'
       or nullif(value->>'product_id','') is null
       or nullif(value->>'quantity','') is null
  ) then
    raise exception 'Informe produto e quantidade em cada item.';
  end if;

  v_service_gross := round(
    coalesce(v_queue.gross_amount, v_queue.total_amount), 2
  );
  v_ticket := coalesce(v_queue.group_ticket_number::text, v_queue.queue_number::text);

  for v_line in
    select entry.value
    from jsonb_array_elements(p_products) entry(value)
    order by entry.value->>'product_id'
  loop
    begin
      v_product_id := (v_line->>'product_id')::uuid;
      v_quantity := (v_line->>'quantity')::integer;
      if (v_line->>'quantity')::numeric <> v_quantity then
        raise exception 'A quantidade deve ser um número inteiro.';
      end if;
    exception when others then
      raise exception 'Produto ou quantidade inválida na comanda.';
    end;

    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'A quantidade de cada produto deve ficar entre 1 e 99.';
    end if;

    select * into v_product
    from public.lacorte_products
    where id = v_product_id and active = true
    for update;

    if not found then
      raise exception 'Um dos produtos foi desativado ou não existe.';
    end if;

    if v_product.stock_quantity < v_quantity then
      raise exception 'Estoque insuficiente para o produto: %.', v_product.name;
    end if;

    v_line_total := round(v_product.price * v_quantity, 2);

    insert into public.lacorte_queue_product_items (
      queue_id, product_id, product_name_snapshot, sku_snapshot,
      quantity, unit_price, line_total, commission_percent_snapshot, added_by
    ) values (
      p_queue_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.price, v_line_total, v_product.commission_percent, auth.uid()
    );

    update public.lacorte_products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product.id;

    insert into public.lacorte_product_stock_movements (
      product_id, quantity_delta, reason, created_by
    ) values (
      v_product.id, -v_quantity, 'Venda na comanda #' || v_ticket, auth.uid()
    );

    v_product_gross := v_product_gross + v_line_total;
    v_product_commission := v_product_commission
      + (v_line_total * v_product.commission_percent / 100);
  end loop;

  v_total_gross := round(v_service_gross + v_product_gross, 2);
  update public.lacorte_queue
  set gross_amount = v_total_gross,
      total_amount = v_total_gross
  where id = p_queue_id;

  perform private.lacorte_finish_service_details_internal(
    p_queue_id, p_discount_amount, p_payments, p_observation
  );

  v_discount := round(coalesce(p_discount_amount, 0), 2);
  v_net := v_total_gross - v_discount;
  v_commission_factor := case
    when v_total_gross > 0 then greatest(v_net, 0) / v_total_gross
    else 0
  end;

  update public.lacorte_queue
  set commission_amount = round((
    v_service_gross * coalesce(v_queue.commission_percent, 0) / 100
    + v_product_commission
  ) * v_commission_factor, 2)
  where id = p_queue_id;
end;
$function$;

revoke all on function private.lacorte_finish_service_details_with_products_internal(uuid,numeric,jsonb,text,jsonb) from public, anon;
grant execute on function private.lacorte_finish_service_details_with_products_internal(uuid,numeric,jsonb,text,jsonb) to authenticated;

create or replace function public.lacorte_finish_service_details_with_products(
  p_queue_id uuid,
  p_discount_amount numeric,
  p_payments jsonb,
  p_observation text default null,
  p_products jsonb default '[]'::jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.lacorte_finish_service_details_with_products_internal(
    p_queue_id, p_discount_amount, p_payments, p_observation, p_products
  );
$function$;

revoke all on function public.lacorte_finish_service_details_with_products(uuid,numeric,jsonb,text,jsonb) from public, anon;
grant execute on function public.lacorte_finish_service_details_with_products(uuid,numeric,jsonb,text,jsonb) to authenticated;
