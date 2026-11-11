create table public.lacorte_shop_settings (
 id integer primary key check(id=1),
 display_name text not null check(length(display_name) between 1 and 80),
 slogan text not null check(length(slogan)<=160),
 opening_days text not null check(length(opening_days) between 1 and 80),
 opening_time time not null,
 closing_time time not null,
 whatsapp text not null check(whatsapp ~ '^[0-9]{10,15}$'),
 instagram text not null check(instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
 updated_at timestamptz not null default now(),
 check(closing_time>opening_time)
);
alter table public.lacorte_shop_settings enable row level security;
revoke all on public.lacorte_shop_settings from public,anon,authenticated;
grant select on public.lacorte_shop_settings to anon,authenticated;
grant update on public.lacorte_shop_settings to authenticated;
create policy shop_public_read on public.lacorte_shop_settings for select to anon,authenticated using(true);
create policy shop_owner_update on public.lacorte_shop_settings for update to authenticated
using(private.is_lacorte_admin()) with check(private.is_lacorte_admin());
insert into public.lacorte_shop_settings(id,display_name,slogan,opening_days,opening_time,closing_time,whatsapp,instagram)
values(1,'La Corte','SEU ESTILO, NOSSA PRIORIDADE','Segunda a sábado','09:00','20:00','5548999426466','la_corte_oficial');
