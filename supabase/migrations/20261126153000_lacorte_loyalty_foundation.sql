-- LaCorte Clube: estruturas aditivas, sem alterar a fila de produção.
-- Não executar em produção antes de revisar/testar em ambiente de homologação.
create table if not exists public.lacorte_loyalty_service_rules (
 service_id uuid primary key references public.services(id) on delete cascade,
 points integer not null check (points >= 0 and points <= 10000),
 active boolean not null default true,
 updated_at timestamptz not null default now()
);
create table if not exists public.lacorte_loyalty_rewards (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 2 and 120),
 description text,
 points_cost integer not null default 200 check (points_cost = 200),
 active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.lacorte_loyalty_lots (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 queue_item_id uuid unique references public.lacorte_queue_items(id),
 points_earned integer not null check(points_earned > 0),
 points_remaining integer not null check(points_remaining >= 0 and points_remaining <= points_earned),
 credited_at timestamptz not null default now(),
 expires_at timestamptz not null,
 constraint lacorte_loyalty_lot_validity check (expires_at > credited_at)
);
create index if not exists lacorte_loyalty_lots_fifo on public.lacorte_loyalty_lots(customer_id,expires_at,credited_at,id) where points_remaining > 0;
create table if not exists public.lacorte_loyalty_redemptions (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 reward_id uuid not null references public.lacorte_loyalty_rewards(id),
 redemption_code uuid not null unique default gen_random_uuid(),
 points_spent integer not null default 200 check(points_spent=200),
 status text not null default 'issued' check(status in ('issued','fulfilled','void')),
 created_at timestamptz not null default now(),
 fulfilled_at timestamptz
);
create table if not exists public.lacorte_loyalty_redemption_allocations (
 redemption_id uuid not null references public.lacorte_loyalty_redemptions(id),
 lot_id uuid not null references public.lacorte_loyalty_lots(id),
 points integer not null check(points > 0),
 primary key(redemption_id,lot_id)
);
-- Bloqueio padrão: nenhum acesso direto pelo navegador.
alter table public.lacorte_loyalty_service_rules enable row level security;
alter table public.lacorte_loyalty_rewards enable row level security;
alter table public.lacorte_loyalty_lots enable row level security;
alter table public.lacorte_loyalty_redemptions enable row level security;
alter table public.lacorte_loyalty_redemption_allocations enable row level security;
revoke all on public.lacorte_loyalty_service_rules,public.lacorte_loyalty_rewards,public.lacorte_loyalty_lots,public.lacorte_loyalty_redemptions,public.lacorte_loyalty_redemption_allocations from anon,authenticated;
-- Funções autenticadas de consulta, crédito e resgate serão adicionadas
-- somente depois de integrar a identidade segura do cliente e os eventos
-- reais de conclusão/cancelamento, com testes de idempotência e concorrência.
