-- Cadastro remoto apenas para contas novas com email confirmado.
-- Não vincular telefone já cadastrado: essa operação exige verificação humana.
create or replace function public.lacorte_online_register_customer(
 p_first_name text,p_last_name text,p_phone text,p_birth_date date
) returns uuid
language plpgsql security definer set search_path='pg_catalog','public','pg_temp'
as $$
declare v_id uuid; v_phone text;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
 if not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
   raise exception 'Confirme seu e-mail antes de cadastrar'; end if;
 if length(trim(coalesce(p_first_name,''))) not between 2 and 80 or length(trim(coalesce(p_last_name,''))) not between 2 and 80 then
   raise exception 'Informe nome e sobrenome'; end if;
 v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(v_phone) not between 10 and 11 then raise exception 'Telefone com DDD inválido'; end if;
 if p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1900-01-01' then
   raise exception 'Data de nascimento inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lacorte:phone:'||v_phone,0));
 select id into v_id from public.customers where user_id=auth.uid() and deleted_at is null limit 1;
 if v_id is not null then return v_id; end if;
 if exists(select 1 from public.customers where regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_phone and deleted_at is null) then
   raise exception 'Telefone já cadastrado. Solicite à barbearia a vinculação segura do seu cadastro existente'; end if;
 insert into public.customers(first_name,last_name,phone,birth_date,user_id)
 values(trim(p_first_name),trim(p_last_name),v_phone,p_birth_date,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.lacorte_online_register_customer(text,text,text,date) from public,anon;
grant execute on function public.lacorte_online_register_customer(text,text,text,date) to authenticated;