-- Preparação da fila online. A migração não cobra nem insere na fila.
-- Executar em homologação e revisar antes de aplicar ao banco real.
create table if not exists public.lacorte_remote_orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 request_id uuid not null,
 service_snapshot jsonb not null check (jsonb_typeof(service_snapshot) = 'array'),
 amount_cents integer not null check (amount_cents > 0),
 currency text not null default 'BRL' check(currency='BRL'),
 status text not null default 'pending_payment'
   check(status in ('pending_payment','paid','queued','reschedule_requested','refund_pending','refunded','expired','cancelled')),
 provider text,
 provider_payment_id text,
 paid_at timestamptz,
 queue_id uuid references public.lacorte_queue(id),
 reschedule_count integer not null default 0 check(reschedule_count between 0 and 1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(customer_id,request_id),
 unique(provider,provider_payment_id),
 unique(queue_id),
 constraint lacorte_remote_orders_paid_consistency check
   (status in ('pending_payment','expired','cancelled') or paid_at is not null),
 constraint lacorte_remote_orders_queue_consistency check
   (status <> 'queued' or queue_id is not null)
);
create index if not exists lacorte_remote_orders_customer_idx
 on public.lacorte_remote_orders(customer_id,created_at desc);
create table if not exists public.lacorte_remote_payment_events (
 id uuid primary key default gen_random_uuid(),
 provider text not null,
 event_id text not null,
 order_id uuid references public.lacorte_remote_orders(id),
 event_type text not null,
 received_at timestamptz not null default now(),
 unique(provider,event_id)
);
create table if not exists public.lacorte_remote_refunds (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.lacorte_remote_orders(id),
 amount_cents integer not null check(amount_cents > 0),
 status text not null default 'requested' check(status in ('requested','processing','paid','rejected')),
 provider_refund_id text unique,
 requested_at timestamptz not null default now(),
 resolved_at timestamptz
);
alter table public.lacorte_remote_orders enable row level security;
alter table public.lacorte_remote_payment_events enable row level security;
alter table public.lacorte_remote_refunds enable row level security;
revoke all on public.lacorte_remote_orders,public.lacorte_remote_payment_events,public.lacorte_remote_refunds from anon,authenticated;
-- Não conceder permissões ao navegador. Backend de pagamentos deverá
-- validar identidade, recalcular preços, verificar assinatura de webhook,
-- processar eventos idempotentemente e criar entrada na fila atomicamente.
-- A ativação depende de provedor Pix configurado e testes de integração.
