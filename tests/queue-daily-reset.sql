-- Verificação transacional: nenhuma senha de teste fica salva.
begin;
do $test$
declare
  v_today date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_customer uuid;
  v_service text;
  v_ticket record;
  v_expected integer;
  v_number integer;
  v_waiting uuid;
  v_active uuid;
  v_completed uuid;
  v_rejected boolean := false;
begin
  select id into strict v_customer from public.customers where deleted_at is null order by created_at limit 1;
  select id into strict v_service from public.services where active order by id limit 1;
  select coalesce(max(queue_number),0)+1 into v_expected from public.lacorte_queue where queue_date=v_today;
  select * into v_ticket from public.lacorte_create_queue_entry_kiosk(v_customer,array[v_service]);
  if v_ticket.ticket_number <> v_expected or v_ticket.queue_date <> v_today then raise exception 'Numeração ou data incorreta'; end if;
  if v_expected=1 and v_ticket.ticket_number<>1 then raise exception 'A fila não começou do 1'; end if;
  v_waiting := v_ticket.appointment_id;
  select coalesce(max(queue_number),0)+1 into v_number from public.lacorte_queue where queue_date=v_today;
  insert into public.lacorte_queue(customer_id,barber_id,queue_date,queue_number,status,total_amount,commission_percent,commission_amount)
  values(v_customer,'barbeiro-1',v_today,v_number,'in_progress',45,100,45) returning id into v_active;
  insert into public.lacorte_queue(customer_id,barber_id,queue_date,queue_number,status,total_amount,commission_percent,commission_amount,completed_at)
  values(v_customer,'barbeiro-1',v_today,v_number+1,'completed',45,100,45,now()) returning id into v_completed;
  perform private.lacorte_expire_previous_queue((v_today+time '23:59:59') at time zone 'America/Sao_Paulo');
  if (select status from public.lacorte_queue where id=v_waiting)<>'waiting' then raise exception 'Senha encerrada antes da meia-noite'; end if;
  perform private.lacorte_expire_previous_queue((v_today+1)::timestamp at time zone 'America/Sao_Paulo');
  if exists(select 1 from public.lacorte_queue where id in(v_waiting,v_active) and status<>'cancelled') then raise exception 'Sobraram senhas ativas na virada'; end if;
  if not exists(select 1 from public.lacorte_queue where id=v_completed and status='completed' and commission_amount=45) then raise exception 'Histórico financeiro alterado'; end if;
  begin
    insert into public.lacorte_queue(customer_id,queue_date,queue_number,status,total_amount,commission_percent,commission_amount)
    values(v_customer,v_today-1,999999,'waiting',45,0,0);
  exception when raise_exception then
    if sqlerrm not like 'A fila foi renovada.%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Fila aceitou senha do dia anterior'; end if;
end;
$test$;
rollback;
