-- LaCorte: registra quando um profissional pula um cliente que prefere outro barbeiro.
-- A senha permanece em status waiting e conserva o número original da fila.

create table if not exists public.lacorte_queue_declines (
  queue_id uuid not null references public.lacorte_queue(id) on delete cascade,
  barber_id text not null references public.barbers(id) on delete restrict,
  declined_at timestamptz not null default now(),
  primary key (queue_id, barber_id)
);

create index if not exists idx_lacorte_queue_declines_barber
  on public.lacorte_queue_declines (barber_id, declined_at desc);

alter table public.lacorte_queue_declines enable row level security;
revoke all on table public.lacorte_queue_declines from anon, authenticated;
grant select on table public.lacorte_queue_declines to authenticated;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lacorte_queue_declines'
      and policyname = 'lacorte_queue_declines_staff_read'
  ) then
    create policy lacorte_queue_declines_staff_read
      on public.lacorte_queue_declines
      for select to authenticated
      using (
        private.is_lacorte_admin()
        or private.is_lacorte_barber(barber_id)
      );
  end if;
end;
$policy$;

create or replace function public.lacorte_decline_queue_entry(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_barber_id text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select r.barber_id
    into v_barber_id
  from public.lacorte_user_roles r
  join public.barbers b
    on b.id = r.barber_id
   and b.active = true
  where r.user_id = auth.uid()
    and r.role = 'barber'
  limit 1;

  if v_barber_id is null then
    raise exception 'Somente um barbeiro ativo pode pular um cliente.';
  end if;

  perform 1
  from public.lacorte_queue q
  where q.id = p_queue_id
    and q.queue_date = (now() at time zone 'America/Sao_Paulo')::date
    and q.status = 'waiting'
    and q.barber_id is null
  for update;

  if not found then
    raise exception 'Este atendimento não está mais disponível para ser pulado.';
  end if;

  insert into public.lacorte_queue_declines (queue_id, barber_id)
  values (p_queue_id, v_barber_id)
  on conflict (queue_id, barber_id) do nothing;
end;
$function$;

revoke all on function public.lacorte_decline_queue_entry(uuid) from public;
revoke all on function public.lacorte_decline_queue_entry(uuid) from anon;
grant execute on function public.lacorte_decline_queue_entry(uuid) to authenticated;

-- Impede que o mesmo profissional inicie uma senha que já pulou.
create or replace function private.lacorte_start_service_internal(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_barber_id text;
  v_percent numeric(5,2);
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select r.barber_id
    into v_barber_id
  from public.lacorte_user_roles r
  where r.user_id = auth.uid()
    and r.role in ('admin', 'barber')
  limit 1;

  if v_barber_id is null then
    raise exception 'Perfil profissional sem barbeiro vinculado.';
  end if;

  select b.commission_percent
    into v_percent
  from public.barbers b
  where b.id = v_barber_id
    and b.active = true;

  if not found then
    raise exception 'Barbeiro inativo ou não encontrado.';
  end if;

  perform 1
  from public.lacorte_queue q
  where q.id = p_queue_id
    and q.status = 'waiting'
    and q.barber_id is null
  for update;

  if not found then
    raise exception 'Este atendimento não está mais disponível na fila.';
  end if;

  if exists (
    select 1
    from public.lacorte_queue_declines d
    where d.queue_id = p_queue_id
      and d.barber_id = v_barber_id
  ) then
    raise exception 'Este cliente prefere aguardar outro profissional.';
  end if;

  update public.lacorte_queue
  set barber_id = v_barber_id,
      commission_percent = v_percent,
      commission_amount = round(total_amount * v_percent / 100, 2),
      status = 'in_progress',
      started_at = now()
  where id = p_queue_id
    and status = 'waiting'
    and barber_id is null;

  if not found then
    raise exception 'Outro barbeiro já iniciou este atendimento.';
  end if;
end;
$function$;
