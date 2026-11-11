-- Active tickets survive midnight. Historical records retain their original dates.
alter policy lacorte_queue_read on public.lacorte_queue using (
 private.is_lacorte_admin() or private.is_lacorte_barber(barber_id)
 or (status in ('waiting','in_progress') and exists(select 1 from public.lacorte_user_roles r where r.user_id=(select auth.uid()) and r.role='barber'))
 or private.lacorte_customer_owned_by_current_user(customer_id)
);
alter policy lacorte_items_read on public.lacorte_queue_items using (
 exists(select 1 from public.lacorte_queue q where q.id=lacorte_queue_items.queue_id and (
  private.is_lacorte_admin() or private.is_lacorte_barber(q.barber_id)
  or (q.status in ('waiting','in_progress') and exists(select 1 from public.lacorte_user_roles r where r.user_id=(select auth.uid()) and r.role='barber'))
  or private.lacorte_customer_owned_by_current_user(q.customer_id)))
);
alter policy "Cliente consulta seus dados" on public.customers using (
 user_id=(select auth.uid()) or private.is_lacorte_admin()
 or private.lacorte_customer_visible_to_current_user(id)
 or (exists(select 1 from public.lacorte_user_roles r where r.user_id=(select auth.uid()) and r.role='barber')
 and exists(select 1 from public.lacorte_queue q where q.customer_id=customers.id and q.status in ('waiting','in_progress')))
);
do $$ declare d text; signature text; begin
 foreach signature in array array['public.lacorte_create_queue_entry_kiosk(uuid,text[])','public.lacorte_create_queue_entry(uuid,text[])'] loop
  d:=pg_get_functiondef(signature::regprocedure);
  d:=replace(d,'PERFORM public.lacorte_close_stale_queue_entries(v_date);','');
  execute d;
 end loop;
 d:=pg_get_functiondef('private.lacorte_decline_queue_entry_internal(uuid)'::regprocedure);
 d:=replace(d,'and q.queue_date = (now() at time zone ''America/Sao_Paulo'')::date','');
 execute d;
end $$;
drop function public.lacorte_close_stale_queue_entries(date);

