-- LaCorte: descontos, pagamentos divididos e fechamento financeiro
-- Aplicado no projeto Supabase xwctsfpqwugygxpsrcfw em 2026-11-09.
-- Idempotente para facilitar a reprodução em outro ambiente.

alter table public.lacorte_queue
  add column if not exists gross_amount numeric(10,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0;

update public.lacorte_queue
set gross_amount = total_amount
where gross_amount = 0 and total_amount > 0;

alter table public.lacorte_queue drop constraint if exists lacorte_queue_payment_method_check;
alter table public.lacorte_queue add constraint lacorte_queue_payment_method_check
  check (payment_method is null or payment_method in ('pix','dinheiro','credito','debito','misto','cortesia'));

create or replace function private.lacorte_queue_set_gross_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.gross_amount is null or new.gross_amount = 0 then
    new.gross_amount := coalesce(new.total_amount, 0);
  end if;
  new.discount_amount := coalesce(new.discount_amount, 0);
  return new;
end;
$$;

drop trigger if exists lacorte_queue_set_gross_amount on public.lacorte_queue;
create trigger lacorte_queue_set_gross_amount
before insert on public.lacorte_queue
for each row execute function private.lacorte_queue_set_gross_amount();

create table if not exists public.lacorte_queue_payments (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.lacorte_queue(id) on delete cascade,
  payment_method text not null check (payment_method in ('pix','dinheiro','credito','debito')),
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_lacorte_queue_payments_queue_id
  on public.lacorte_queue_payments(queue_id);

alter table public.lacorte_queue_payments enable row level security;
revoke all on public.lacorte_queue_payments from anon, authenticated;
grant select on public.lacorte_queue_payments to authenticated;

drop policy if exists lacorte_queue_payments_read on public.lacorte_queue_payments;
create policy lacorte_queue_payments_read
on public.lacorte_queue_payments
for select to authenticated
using (
  exists (
    select 1 from public.lacorte_queue q
    where q.id = queue_id
      and (private.is_lacorte_admin() or private.is_lacorte_barber(q.barber_id))
  )
);

create or replace function private.lacorte_finish_service_with_payments_internal(
  p_queue_id uuid,
  p_discount_amount numeric,
  p_payments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.lacorte_queue%rowtype;
  v_discount numeric(10,2);
  v_net numeric(10,2);
  v_paid numeric(10,2);
  v_method_count integer;
  v_method text;
  v_amount numeric(10,2);
  v_payment jsonb;
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

  v_discount := round(coalesce(p_discount_amount, 0), 2);
  if v_discount < 0 or v_discount > coalesce(v_queue.gross_amount, v_queue.total_amount) then
    raise exception 'Desconto inválido.';
  end if;

  v_net := round(coalesce(v_queue.gross_amount, v_queue.total_amount) - v_discount, 2);
  if jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Informe as formas e valores de pagamento.';
  end if;

  select count(*) into v_method_count from jsonb_array_elements(p_payments);
  if (v_net = 0 and v_method_count <> 0) or (v_net > 0 and (v_method_count < 1 or v_method_count > 4)) then
    raise exception 'Informe de uma a quatro formas de pagamento e seus valores.';
  end if;

  delete from public.lacorte_queue_payments where queue_id = p_queue_id;
  v_paid := 0;
  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_method := v_payment->>'method';
    if v_method not in ('pix','dinheiro','credito','debito') then
      raise exception 'Forma de pagamento inválida.';
    end if;
    begin
      v_amount := round((v_payment->>'amount')::numeric, 2);
    exception when others then
      raise exception 'Valor de pagamento inválido.';
    end;
    if v_amount <= 0 then raise exception 'Os valores de pagamento devem ser maiores que zero.'; end if;
    if exists (select 1 from public.lacorte_queue_payments p where p.queue_id=p_queue_id and p.payment_method=v_method) then
      raise exception 'Não repita a mesma forma de pagamento.';
    end if;
    insert into public.lacorte_queue_payments(queue_id,payment_method,amount)
    values(p_queue_id,v_method,v_amount);
    v_paid := v_paid + v_amount;
  end loop;

  if round(v_paid,2) <> v_net then
    raise exception 'A soma dos pagamentos deve ser exatamente %.', to_char(v_net,'FM999999990D00');
  end if;

  select count(*) into v_method_count from public.lacorte_queue_payments where queue_id=p_queue_id;
  select min(payment_method) into v_method from public.lacorte_queue_payments where queue_id=p_queue_id;

  update public.lacorte_queue
  set discount_amount = v_discount,
      total_amount = v_net,
      payment_method = case
        when v_net = 0 then 'cortesia'
        when v_method_count = 1 then v_method
        else 'misto'
      end,
      commission_amount = round(v_net * commission_percent / 100, 2)
  where id = p_queue_id;

  perform public.lacorte_finish_service(p_queue_id);
end;
$$;

create or replace function public.lacorte_finish_service_with_payments(
  p_queue_id uuid,
  p_discount_amount numeric,
  p_payments jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.lacorte_finish_service_with_payments_internal(
    p_queue_id, p_discount_amount, p_payments
  );
$$;

revoke all on function private.lacorte_finish_service_with_payments_internal(uuid,numeric,jsonb) from public, anon;
grant execute on function private.lacorte_finish_service_with_payments_internal(uuid,numeric,jsonb) to authenticated, service_role;
revoke all on function public.lacorte_finish_service_with_payments(uuid,numeric,jsonb) from public, anon;
grant execute on function public.lacorte_finish_service_with_payments(uuid,numeric,jsonb) to authenticated, service_role;
