-- Fluxo manual de Pix: proposta para homologação, NÃO aplicar sem revisão.
-- Pedidos remotos separados da fila presencial até aprovação administrativa.
create table if not exists public.lacorte_remote_manual_orders (
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check (length(trim(customer_name)) between 2 and 100),
 customer_phone text not null check (length(customer_phone) between 10 and 20),
 service_id text not null references public.services(id),
 amount_cents integer not null check(amount_cents > 0),
 status text not null default 'awaiting_pix' check(status in ('awaiting_pix','approved','cancelled')),
 queue_id uuid unique references public.lacorte_queue(id),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 constraint approved_only_with_ticket check(status <> 'approved' or (queue_id is not null and approved_by is not null and approved_at is not null))
);
create index if not exists lacorte_remote_manual_orders_pending_idx on public.lacorte_remote_manual_orders(created_at) where status='awaiting_pix';
alter table public.lacorte_remote_manual_orders enable row level security;
revoke all on public.lacorte_remote_manual_orders from anon,authenticated;
-- Pendente: endpoints de criação com rate limit, validação de telefone,
-- preço calculado no servidor, autorização de admin, transação atômica
-- para criação de ticket e idempotência de aprovação.
-- Jamais expor token administrativo no link do WhatsApp do cliente.
