alter table public.lacorte_queue add column observation text check (length(observation) <= 300);
create function private.lacorte_finish_service_details_internal(p_queue_id uuid,p_discount_amount numeric,p_payments jsonb,p_observation text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
 if length(coalesce(p_observation,'')) > 300 then raise exception 'Use uma observação de até 300 caracteres.'; end if;
 -- The existing function locks the entry, checks ownership/status, validates the
 -- discount and split amounts, and calculates the authoritative commission.
 perform private.lacorte_finish_service_with_payments_internal(p_queue_id,p_discount_amount,p_payments);
 update public.lacorte_queue set observation=nullif(trim(p_observation),'') where id=p_queue_id;
end; $$;
revoke all on function private.lacorte_finish_service_details_internal(uuid,numeric,jsonb,text) from public,anon;
grant execute on function private.lacorte_finish_service_details_internal(uuid,numeric,jsonb,text) to authenticated;
create function public.lacorte_finish_service_details(p_queue_id uuid,p_discount_amount numeric,p_payments jsonb,p_observation text default null)
returns void language sql security invoker set search_path='' as $$
 select private.lacorte_finish_service_details_internal(p_queue_id,p_discount_amount,p_payments,p_observation);
$$;
revoke all on function public.lacorte_finish_service_details(uuid,numeric,jsonb,text) from public,anon;
grant execute on function public.lacorte_finish_service_details(uuid,numeric,jsonb,text) to authenticated;
