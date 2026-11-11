alter table public.lacorte_queue add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id) on delete set null, add column cancel_reason text check(length(cancel_reason)<=300);
alter table public.customers add column deleted_at timestamptz, add column deleted_by uuid references auth.users(id) on delete set null;
create function private.lacorte_cancel_appointment_internal(p_queue_id uuid,p_reason text) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare q public.lacorte_queue%rowtype; r public.lacorte_plan_cut_reservations%rowtype;
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado.'; end if;
 if length(coalesce(p_reason,''))>300 then raise exception 'Use um motivo de até 300 caracteres.'; end if;
 select * into q from public.lacorte_queue where id=p_queue_id for update;
 if not found then raise exception 'Atendimento não encontrado.'; end if;
 if not (private.is_lacorte_admin() or private.is_lacorte_barber(q.barber_id)) then raise exception 'Você só pode cancelar seus próprios atendimentos.'; end if;
 if q.status='cancelled' then return; end if;
 select * into r from public.lacorte_plan_cut_reservations where queue_id=q.id for update;
 if found and r.status='consumed' then
  update public.lacorte_customer_plans set used_cuts=greatest(used_cuts-1,0),
   status=case when status='exhausted' and expires_at >= (now() at time zone 'America/Sao_Paulo')::date then 'active' else status end
   where id=r.customer_plan_id;
  update public.lacorte_plan_cut_reservations set status='released',released_at=now() where id=r.id;
 end if;
 update public.lacorte_queue set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=nullif(trim(p_reason),'') where id=q.id;
end; $$;
revoke all on function private.lacorte_cancel_appointment_internal(uuid,text) from public,anon;
grant execute on function private.lacorte_cancel_appointment_internal(uuid,text) to authenticated,service_role;
create function public.lacorte_cancel_appointment(p_queue_id uuid,p_reason text default null) returns void language sql set search_path=pg_catalog,public,private,pg_temp as $$ select private.lacorte_cancel_appointment_internal(p_queue_id,p_reason); $$;
revoke all on function public.lacorte_cancel_appointment(uuid,text) from public,anon;
grant execute on function public.lacorte_cancel_appointment(uuid,text) to authenticated,service_role;
create or replace function private.lacorte_cancel_queue_entry_internal(p_queue_id uuid) returns void language sql security definer set search_path=pg_catalog,public,private,pg_temp as $$ select private.lacorte_cancel_appointment_internal(p_queue_id,null); $$;
create function private.lacorte_delete_customer_internal(p_customer_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.customers%rowtype; q record;
begin
 if auth.uid() is null or not private.is_lacorte_admin() then raise exception 'Acesso exclusivo do administrador.'; end if;
 select * into c from public.customers where id=p_customer_id for update;
 if not found then raise exception 'Cliente não encontrado.'; end if;
 if c.deleted_at is not null then return; end if;
 for q in select id from public.lacorte_queue where customer_id=c.id and status in ('waiting','in_progress') order by id loop
  perform private.lacorte_cancel_appointment_internal(q.id,'Cadastro excluído pelo administrador.');
 end loop;
 update public.lacorte_customer_plans set status='suspended' where customer_id=c.id and status='active';
 update public.customers set deleted_at=now(),deleted_by=auth.uid(),phone=null,email=null,birth_date=null,user_id=null,updated_at=now() where id=c.id;
end; $$;
revoke all on function private.lacorte_delete_customer_internal(uuid) from public,anon;
grant execute on function private.lacorte_delete_customer_internal(uuid) to authenticated,service_role;
create function public.lacorte_delete_customer(p_customer_id uuid) returns void language sql set search_path=pg_catalog,public,private,pg_temp as $$ select private.lacorte_delete_customer_internal(p_customer_id); $$;
revoke all on function public.lacorte_delete_customer(uuid) from public,anon;
grant execute on function public.lacorte_delete_customer(uuid) to authenticated,service_role;
-- Preserve the deployed function bodies while adding active-customer checks and locks.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.lacorte_find_customer_for_kiosk(text)'::regprocedure);
 d:=regexp_replace(d,'WHERE(\s*)\(length','WHERE\1c.deleted_at IS NULL AND (length','g');
 d:=replace(d,'OR (','OR ( c.deleted_at IS NULL AND');
 execute d;
 d:=pg_get_functiondef('public.lacorte_create_queue_entry_kiosk(uuid,text[])'::regprocedure);
 d:=replace(d,'IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=p_customer_id) THEN','PERFORM 1 FROM public.customers c WHERE c.id=p_customer_id AND c.deleted_at IS NULL FOR SHARE; IF NOT FOUND THEN');
 execute d;
 d:=pg_get_functiondef('public.lacorte_create_queue_group_kiosk(uuid,uuid,jsonb)'::regprocedure);
 d:=replace(d,'from public.customers c where c.id=p_customer_id;','from public.customers c where c.id=p_customer_id and c.deleted_at is null for share;');
 execute d;
end $$;
