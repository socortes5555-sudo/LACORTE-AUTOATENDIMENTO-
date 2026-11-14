-- LaCorte: permite ao administrador reabrir uma preferência somente após confirmação do cliente.
-- A senha permanece aguardando, sem alterar seu número, posição ou histórico de atendimento.

alter table public.lacorte_queue_declines
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete restrict,
  add column if not exists resolution_reason text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lacorte_queue_declines'::regclass
      and conname = 'lacorte_queue_declines_resolution_reason_length'
  ) then
    alter table public.lacorte_queue_declines
      add constraint lacorte_queue_declines_resolution_reason_length
      check (resolution_reason is null or pg_catalog.char_length(resolution_reason) <= 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lacorte_queue_declines'::regclass
      and conname = 'lacorte_queue_declines_resolution_consistency'
  ) then
    alter table public.lacorte_queue_declines
      add constraint lacorte_queue_declines_resolution_consistency
      check (
        (resolved_at is null and resolved_by is null and resolution_reason is null)
        or
        (resolved_at is not null and resolved_by is not null and resolution_reason is not null)
      );
  end if;
end;
$constraints$;

create index if not exists idx_lacorte_queue_declines_pending
  on public.lacorte_queue_declines (queue_id, barber_id)
  where resolved_at is null;

-- Histórico append-only: cada reabertura fica registrada mesmo se o cliente voltar a recusar.
create table if not exists public.lacorte_queue_decline_resolutions (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.lacorte_queue(id) on delete restrict,
  barber_id text not null references public.barbers(id) on delete restrict,
  admin_id uuid not null references auth.users(id) on delete restrict,
  customer_confirmed boolean not null default true check (customer_confirmed is true),
  reason text not null check (pg_catalog.char_length(reason) between 1 and 200),
  resolved_at timestamptz not null default now()
);

create index if not exists idx_lacorte_queue_decline_resolutions_queue
  on public.lacorte_queue_decline_resolutions (queue_id, resolved_at desc);

alter table public.lacorte_queue_decline_resolutions enable row level security;
revoke all on table public.lacorte_queue_decline_resolutions from anon, authenticated;
grant select on table public.lacorte_queue_decline_resolutions to authenticated;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lacorte_queue_decline_resolutions'
      and policyname = 'lacorte_queue_decline_resolutions_admin_read'
  ) then
    create policy lacorte_queue_decline_resolutions_admin_read
      on public.lacorte_queue_decline_resolutions
      for select to authenticated
      using (private.is_lacorte_admin());
  end if;
end;
$policy$;

-- Se o cliente voltar a recusar o mesmo profissional, reabre a recusa atual.
-- A resolução anterior continua preservada na tabela append-only acima.
create or replace function private.lacorte_decline_queue_entry_internal(p_queue_id uuid)
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

  insert into public.lacorte_queue_declines as existing_decline (queue_id, barber_id)
  values (p_queue_id, v_barber_id)
  on conflict (queue_id, barber_id) do update
    set declined_at = excluded.declined_at,
        resolved_at = null,
        resolved_by = null,
        resolution_reason = null
    where existing_decline.resolved_at is not null;
end;
$function$;

-- Só o administrador pode reabrir uma preferência, e apenas após confirmar com o cliente.
create or replace function private.lacorte_admin_resolve_queue_decline_internal(
  p_queue_id uuid,
  p_barber_id text,
  p_customer_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not private.is_lacorte_admin() then
    raise exception 'Somente o administrador pode revisar esta preferência.';
  end if;

  if p_customer_confirmed is distinct from true then
    raise exception 'Confirme que o cliente aceita este profissional.';
  end if;

  perform 1
  from public.lacorte_queue q
  where q.id = p_queue_id
    and q.status = 'waiting'
    and q.barber_id is null
  for update;

  if not found then
    raise exception 'Esta senha não está mais aguardando na fila.';
  end if;

  if not exists (
    select 1 from public.barbers b
    where b.active is true
  ) then
    raise exception 'Não há profissionais ativos para receber esta senha.';
  end if;

  if not exists (
    select 1 from public.barbers b
    where b.id = p_barber_id
      and b.active is true
  ) then
    raise exception 'O profissional escolhido não está ativo.';
  end if;

  if exists (
    select 1
    from public.barbers b
    where b.active is true
      and not exists (
        select 1
        from public.lacorte_queue_declines d
        where d.queue_id = p_queue_id
          and d.barber_id = b.id
          and d.resolved_at is null
      )
  ) then
    raise exception 'Ainda existe profissional ativo que não pulou esta senha.';
  end if;

  insert into public.lacorte_queue_decline_resolutions (
    queue_id, barber_id, admin_id, customer_confirmed, reason
  )
  values (
    p_queue_id,
    p_barber_id,
    auth.uid(),
    true,
    'Cliente confirmou que aceita ser atendido por este profissional.'
  );

  update public.lacorte_queue_declines
  set resolved_at = pg_catalog.now(),
      resolved_by = auth.uid(),
      resolution_reason = 'Cliente confirmou que aceita ser atendido por este profissional.'
  where queue_id = p_queue_id
    and barber_id = p_barber_id
    and resolved_at is null;

  if not found then
    raise exception 'A preferência deste profissional já foi revisada.';
  end if;
end;
$function$;

revoke all on function private.lacorte_admin_resolve_queue_decline_internal(uuid, text, boolean) from public;
revoke all on function private.lacorte_admin_resolve_queue_decline_internal(uuid, text, boolean) from anon;
grant execute on function private.lacorte_admin_resolve_queue_decline_internal(uuid, text, boolean) to authenticated;

create or replace function public.lacorte_admin_resolve_queue_decline(
  p_queue_id uuid,
  p_barber_id text,
  p_customer_confirmed boolean
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.lacorte_admin_resolve_queue_decline_internal(
    p_queue_id,
    p_barber_id,
    p_customer_confirmed
  );
$function$;

revoke all on function public.lacorte_admin_resolve_queue_decline(uuid, text, boolean) from public;
revoke all on function public.lacorte_admin_resolve_queue_decline(uuid, text, boolean) from anon;
grant execute on function public.lacorte_admin_resolve_queue_decline(uuid, text, boolean) to authenticated;

-- Um profissional só pode iniciar se a recusa dele não estiver mais pendente.
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
      and d.resolved_at is null
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
