create or replace function public.lacorte_create_queue_group_kiosk(
  p_customer_id uuid, p_request_id uuid, p_participants jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_customer_name text;
  v_normalized jsonb := '[]'::jsonb;
  v_person jsonb;
  v_name text;
  v_ids text[];
  v_index integer := 0;
  v_count integer;
  v_total numeric(10,2);
  v_date date;
  v_first record;
  v_group_id uuid;
  v_existing jsonb;
  v_queue_id uuid;
  v_number integer;
  v_response jsonb;
begin
  if p_request_id is null then
    raise exception 'Identificador da solicitação inválido.';
  end if;
  if jsonb_typeof(p_participants) is distinct from 'array' then
    raise exception 'Informe as pessoas e seus serviços.';
  end if;
  if jsonb_array_length(p_participants) not between 1 and 6 then
    raise exception 'Adicione de uma a seis pessoas.';
  end if;

  select left(trim(concat_ws(' ',c.first_name,c.last_name)),100)
    into v_customer_name
    from public.customers c where c.id=p_customer_id;
  if not found then raise exception 'Cadastro não encontrado.'; end if;

  for v_person in select value from jsonb_array_elements(p_participants)
  loop
    v_index := v_index+1;
    if jsonb_typeof(v_person) is distinct from 'object'
      or jsonb_typeof(v_person->'service_ids') is distinct from 'array' then
      raise exception 'Selecione os serviços de cada pessoa.';
    end if;
    if jsonb_array_length(v_person->'service_ids') not between 1 and 13 then
      raise exception 'Selecione ao menos um serviço para cada pessoa.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_person->'service_ids') e
      where jsonb_typeof(e.value) <> 'string'
        or length(e.value #>> '{}') not between 1 and 80
    ) then raise exception 'Lista de serviços inválida.'; end if;

    select array_agg(value order by value) into v_ids
      from jsonb_array_elements_text(v_person->'service_ids');
    if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) id) then
      raise exception 'Não repita um serviço para a mesma pessoa.';
    end if;
    v_name := case when v_index=1 then v_customer_name
      else coalesce(nullif(trim(regexp_replace(coalesce(v_person->>'name',''),'\s+',' ','g')),''),'Pessoa '||v_index) end;
    if length(v_name) > 100 then raise exception 'Use um nome de até 100 caracteres.'; end if;
    v_normalized := v_normalized || jsonb_build_array(
      jsonb_build_object('name',v_name,'service_ids',to_jsonb(v_ids))
    );
  end loop;

  -- The same request is retried safely after a lost response or a page reload.
  perform pg_advisory_xact_lock(hashtextextended(
    'lacorte-group:'||p_customer_id::text||':'||p_request_id::text,0));
  select q.group_id into v_group_id
    from public.lacorte_queue q
    where q.customer_id=p_customer_id and q.group_request_id=p_request_id
      and q.participant_index=1;
  if v_group_id is not null then
    select jsonb_agg(jsonb_build_object(
      'name',q.participant_name,
      'service_ids',(select jsonb_agg(i.service_id order by i.service_id)
        from public.lacorte_queue_items i where i.queue_id=q.id)
    ) order by q.participant_index) into v_existing
    from public.lacorte_queue q where q.group_id=v_group_id;
    if v_existing is distinct from v_normalized then
      raise exception 'Esta solicitação já foi usada. Revise os serviços e tente novamente.';
    end if;
  else
    -- Validate every participant before creating anything. Row locks keep prices stable.
    perform 1 from public.services s
      where s.id in (select jsonb_array_elements_text(p->'service_ids')
        from jsonb_array_elements(v_normalized) p)
      order by s.id for share;
    for v_person in select value from jsonb_array_elements(v_normalized)
    loop
      select count(*) into v_count from public.services s
        where s.active and s.id in (
          select jsonb_array_elements_text(v_person->'service_ids'));
      if v_count <> jsonb_array_length(v_person->'service_ids') then
        raise exception 'Um ou mais serviços estão indisponíveis.';
      end if;
    end loop;

    -- Preserve the existing subscription reservation rules for the registered holder.
    select array_agg(value order by value) into v_ids
      from jsonb_array_elements_text(v_normalized->0->'service_ids');
    select * into v_first from public.lacorte_create_queue_entry_kiosk(p_customer_id,v_ids);
    v_group_id := v_first.appointment_id;
    select coalesce(max(coalesce(q.group_ticket_number,q.queue_number)),0)+1 into v_number
      from public.lacorte_queue q where q.queue_date=v_first.queue_date and q.id<>v_group_id;
    v_date := v_first.queue_date;
    update public.lacorte_queue
      set group_id=v_group_id,group_ticket_number=v_number,group_request_id=p_request_id,
        participant_index=1,participant_name=v_customer_name
      where id=v_group_id;

    v_index := 0;
    for v_person in select value from jsonb_array_elements(v_normalized)
    loop
      v_index := v_index+1;
      if v_index=1 then continue; end if;
      select array_agg(value order by value) into v_ids
        from jsonb_array_elements_text(v_person->'service_ids');
      select sum(s.price) into v_total from public.services s where s.id=any(v_ids);
      insert into public.lacorte_queue(
        customer_id,queue_date,queue_number,status,total_amount,commission_percent,commission_amount,
        group_id,group_ticket_number,group_request_id,participant_index,participant_name
      ) values (
        p_customer_id,v_date,v_first.ticket_number+v_index-1,'waiting',v_total,0,0,
        v_group_id,v_number,p_request_id,v_index,v_person->>'name'
      ) returning id into v_queue_id;
      insert into public.lacorte_queue_items(queue_id,service_id,service_name,unit_price)
        select v_queue_id,s.id,s.name,s.price from public.services s where s.id=any(v_ids);
    end loop;
  end if;

  select jsonb_build_object(
    'ticket_number',min(q.group_ticket_number),
    'total_amount',sum(q.total_amount),
    'queue_date',min(q.queue_date),
    'participants',jsonb_agg(jsonb_build_object(
      'name',q.participant_name,'number',q.participant_index,
      'total_amount',q.total_amount,'status',q.status
    ) order by q.participant_index)
  ) into v_response from public.lacorte_queue q where q.group_id=v_group_id;
  return v_response;
end;
$function$;

revoke all on function public.lacorte_create_queue_group_kiosk(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.lacorte_create_queue_group_kiosk(uuid,uuid,jsonb)
  to service_role;
