-- Pedidos Pix manuais. Revisar em homologação antes de executar em produção.
-- Cliente autenticado solicita; somente admin autenticado libera senha.
create table if not exists public.lacorte_whatsapp_orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 service_id text not null references public.services(id),
 service_name text not null,
 amount numeric(10,2) not null check(amount>0),
 status text not null default 'awaiting_payment' check(status in ('awaiting_payment','approved','cancelled')),
 queue_id uuid unique references public.lacorte_queue(id),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 check (status <> 'approved' or (queue_id is not null and approved_by is not null and approved_at is not null))
);
create index if not exists lacorte_whatsapp_orders_pending on public.lacorte_whatsapp_orders(created_at) where status='awaiting_payment';
alter table public.lacorte_whatsapp_orders enable row level security;
revoke all on public.lacorte_whatsapp_orders from public,anon,authenticated;
-- Não expor dados de pedidos por SELECT direto; usar RPCs autenticadas.
create or replace function public.lacorte_whatsapp_request(p_service_id text)
returns table(order_id uuid, service_name text, amount numeric)
language plpgsql security definer set search_path='pg_catalog','public','pg_temp'
as $$
declare v_customer uuid; v_service public.services%rowtype; v_order uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
 select id into v_customer from public.customers where user_id=auth.uid() and deleted_at is null order by created_at limit 1;
 if v_customer is null then raise exception 'Cadastro de cliente não encontrado'; end if;
 select * into v_service from public.services where id=p_service_id and active=true;
 if not found then raise exception 'Serviço indisponível'; end if;
 -- Limite de pedidos abertos por cliente para reduzir spam.
 if (select count(*) from public.lacorte_whatsapp_orders where customer_id=v_customer and status='awaiting_payment' and created_at>now()-interval '1 day')>=3 then
   raise exception 'Limite de pedidos pendentes atingido';
 end if;
 insert into public.lacorte_whatsapp_orders(customer_id,service_id,service_name,amount)
 values(v_customer,v_service.id,v_service.name,v_service.price) returning id into v_order;
 return query select v_order,v_service.name,v_service.price;
end $$;
revoke all on function public.lacorte_whatsapp_request(text) from public,anon;
grant execute on function public.lacorte_whatsapp_request(text) to authenticated;

create or replace function public.lacorte_whatsapp_pending()
returns table(order_id uuid, customer_name text, service_name text, amount numeric, created_at timestamptz)
language plpgsql security definer set search_path='pg_catalog','public','pg_temp'
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.lacorte_user_roles where user_id=auth.uid() and role='admin') then
 raise exception 'Acesso restrito ao administrador'; end if;
 return query select o.id,concat_ws(' ',c.first_name,c.last_name),o.service_name,o.amount,o.created_at
 from public.lacorte_whatsapp_orders o join public.customers c on c.id=o.customer_id
 where o.status='awaiting_payment' order by o.created_at;
end $$;
revoke all on function public.lacorte_whatsapp_pending() from public,anon;
grant execute on function public.lacorte_whatsapp_pending() to authenticated;

create or replace function public.lacorte_whatsapp_approve(p_order_id uuid)
returns table(ticket_number integer, queue_id uuid, queue_date date)
language plpgsql security definer set search_path='pg_catalog','public','pg_temp'
as $$
declare v_order public.lacorte_whatsapp_orders%rowtype; v_day date; v_ticket integer; v_queue uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.lacorte_user_roles where user_id=auth.uid() and role='admin') then
 raise exception 'Acesso restrito ao administrador'; end if;
 select * into v_order from public.lacorte_whatsapp_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if v_order.status='approved' then
   return query select q.queue_number,q.id,q.queue_date from public.lacorte_queue q where q.id=v_order.queue_id;
   return;
 end if;
 if v_order.status<>'awaiting_payment' then raise exception 'Pedido não pode ser aprovado'; end if;
 if v_order.created_at < now()-interval '1 day' then raise exception 'Pedido expirado: solicite um novo'; end if;
 perform private.lacorte_expire_previous_queue();
 v_day:=(now() at time zone 'America/Sao_Paulo')::date;
 perform pg_advisory_xact_lock(hashtextextended('lacorte:'||v_day::text,0));
 select coalesce(max(q.queue_number),0)+1 into v_ticket from public.lacorte_queue q where q.queue_date=v_day;
 insert into public.lacorte_queue(customer_id,queue_date,queue_number,status,total_amount,commission_percent,commission_amount,payment_method,gross_amount,observation)
 values(v_order.customer_id,v_day,v_ticket,'waiting',v_order.amount,0,0,'pix',v_order.amount,'Pix online confirmado manualmente pelo administrador')
 returning id into v_queue;
 insert into public.lacorte_queue_items(queue_id,service_id,service_name,unit_price)
 values(v_queue,v_order.service_id,v_order.service_name,v_order.amount);
 update public.lacorte_whatsapp_orders set status='approved',queue_id=v_queue,approved_by=auth.uid(),approved_at=now() where id=p_order_id;
 return query select v_ticket,v_queue,v_day;
end $$;
revoke all on function public.lacorte_whatsapp_approve(uuid) from public,anon;
grant execute on function public.lacorte_whatsapp_approve(uuid) to authenticated;

create or replace function public.lacorte_whatsapp_my_orders()
returns table(order_id uuid, status text, ticket_number integer, service_name text, amount numeric)
language plpgsql security definer set search_path='pg_catalog','public','pg_temp'
as $$
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
 return query select o.id,o.status,q.queue_number,o.service_name,o.amount
 from public.lacorte_whatsapp_orders o
 join public.customers c on c.id=o.customer_id
 left join public.lacorte_queue q on q.id=o.queue_id
 where c.user_id=auth.uid() order by o.created_at desc limit 20;
end $$;
revoke all on function public.lacorte_whatsapp_my_orders() from public,anon;
grant execute on function public.lacorte_whatsapp_my_orders() to authenticated;
