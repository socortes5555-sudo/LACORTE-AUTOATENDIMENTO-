-- Keep the public RPC as SECURITY INVOKER and place privileged work in private schema.
-- This follows the existing LaCorte queue RPC pattern and avoids exposing a SECURITY DEFINER
-- function directly through the public PostgREST schema.

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

  insert into public.lacorte_queue_declines (queue_id, barber_id)
  values (p_queue_id, v_barber_id)
  on conflict (queue_id, barber_id) do nothing;
end;
$function$;

revoke all on function private.lacorte_decline_queue_entry_internal(uuid) from public;
revoke all on function private.lacorte_decline_queue_entry_internal(uuid) from anon;
grant execute on function private.lacorte_decline_queue_entry_internal(uuid) to authenticated;

create or replace function public.lacorte_decline_queue_entry(p_queue_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.lacorte_decline_queue_entry_internal(p_queue_id);
$function$;

revoke all on function public.lacorte_decline_queue_entry(uuid) from public;
revoke all on function public.lacorte_decline_queue_entry(uuid) from anon;
grant execute on function public.lacorte_decline_queue_entry(uuid) to authenticated;
