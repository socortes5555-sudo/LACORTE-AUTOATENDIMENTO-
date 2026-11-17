-- A fila operacional pertence a um único dia em Brasília.
-- Substitui o comportamento antigo de manter senhas pendentes após a meia-noite.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.lacorte_expire_previous_queue(p_now timestamptz default clock_timestamp())
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_today date := (coalesce(p_now,clock_timestamp()) at time zone 'America/Sao_Paulo')::date;
begin
  update public.lacorte_queue
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at,p_now),
      cancel_reason = 'Encerramento automático: fila renovada na virada do dia.'
  where queue_date < v_today and status in ('waiting','in_progress');
  get diagnostics v_count = row_count;
  -- O trigger existente libera reservas de assinatura ao cancelar a senha.
  return v_count;
end;
$function$;
revoke all on function private.lacorte_expire_previous_queue(timestamptz) from public, anon, authenticated;
grant execute on function private.lacorte_expire_previous_queue(timestamptz) to service_role;

-- Impede iniciar, reabrir ou finalizar uma senha antiga mesmo antes da execução do cron.
create or replace function private.lacorte_enforce_queue_business_day()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare v_today date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status in ('waiting','in_progress') and new.queue_date <> v_today then
    raise exception 'A fila foi renovada. Esta senha pertence a outro dia; entre novamente na fila.';
  end if;
  if tg_op = 'UPDATE' then
    if old.status in ('waiting','in_progress') and new.status = 'completed' and old.queue_date <> v_today then
      raise exception 'A fila foi renovada. Não é possível finalizar uma senha do dia anterior.';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.lacorte_enforce_queue_business_day() from public, anon, authenticated;
create trigger lacorte_enforce_queue_business_day
before insert or update on public.lacorte_queue
for each row execute function private.lacorte_enforce_queue_business_day();

-- Libera reservas antigas antes de calcular o saldo da assinatura em uma nova entrada.
do $migration$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array[
    'public.lacorte_create_queue_entry_kiosk(uuid,text[])',
    'public.lacorte_create_queue_entry(uuid,text[])',
    'public.lacorte_create_queue_entry(uuid,text,text[])'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position('private.lacorte_expire_previous_queue()' in v_definition) = 0 then
      v_definition := regexp_replace(v_definition,'\mBEGIN\M',
        'BEGIN PERFORM private.lacorte_expire_previous_queue();','i');
      execute v_definition;
    end if;
  end loop;
end;
$migration$;

-- Verifica a data local a cada minuto, inclusive com aplicativos e computador fechados.
select cron.schedule('lacorte-daily-queue-reset','* * * * *',
  'select private.lacorte_expire_previous_queue();');
-- Corrige imediatamente as senhas de dias anteriores que ainda estavam abertas.
select private.lacorte_expire_previous_queue();
