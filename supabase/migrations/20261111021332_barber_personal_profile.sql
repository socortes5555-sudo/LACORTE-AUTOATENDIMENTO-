create table public.lacorte_staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name)<=80),
  photo text check (photo is null or (
    length(photo)<=350000 and photo ~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$'
  )),
  zoom numeric(4,2) not null default 1 check (zoom between 1 and 3),
  crop_x smallint not null default 50 check (crop_x between 0 and 100),
  crop_y smallint not null default 50 check (crop_y between 0 and 100),
  report_period text not null default 'today'
    check (report_period in ('today','week','fortnight','month')),
  updated_at timestamptz not null default now()
);

alter table public.lacorte_staff_profiles enable row level security;
revoke all on public.lacorte_staff_profiles from anon, authenticated;
grant select,insert,update on public.lacorte_staff_profiles to authenticated;
grant all on public.lacorte_staff_profiles to service_role;

create policy lacorte_staff_profile_read on public.lacorte_staff_profiles
  for select to authenticated
  using (
    user_id=(select auth.uid()) and exists (
      select 1 from public.lacorte_user_roles r
        where r.user_id=(select auth.uid()) and r.role='barber'
    )
  );
create policy lacorte_staff_profile_insert on public.lacorte_staff_profiles
  for insert to authenticated
  with check (
    user_id=(select auth.uid()) and exists (
      select 1 from public.lacorte_user_roles r
        where r.user_id=(select auth.uid()) and r.role='barber'
    )
  );
create policy lacorte_staff_profile_update on public.lacorte_staff_profiles
  for update to authenticated
  using (
    user_id=(select auth.uid()) and exists (
      select 1 from public.lacorte_user_roles r
        where r.user_id=(select auth.uid()) and r.role='barber'
    )
  )
  with check (
    user_id=(select auth.uid()) and exists (
      select 1 from public.lacorte_user_roles r
        where r.user_id=(select auth.uid()) and r.role='barber'
    )
  );
