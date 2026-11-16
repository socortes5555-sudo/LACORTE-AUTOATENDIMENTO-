import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261116172905_lacorte_product_comanda.sql', 'utf8');
const barber = readFileSync('barber.js', 'utf8');
const admin = readFileSync('admin.js', 'utf8');
const equipe = readFileSync('equipe/index.html', 'utf8');
const barbeiros = readFileSync('barbeiros.html', 'utf8');

test('a comanda preserva snapshots dos produtos e impede exclusão do histórico', () => {
  assert.match(migration, /create table if not exists public\.lacorte_queue_product_items/i);
  assert.match(migration, /references public\.lacorte_queue\(id\) on delete restrict/i);
  assert.match(migration, /references public\.lacorte_products\(id\) on delete restrict/i);
  assert.match(migration, /product_name_snapshot text not null/i);
  assert.match(migration, /commission_percent_snapshot numeric/i);
  assert.match(migration, /unique \(queue_id, product_id\)/i);
  assert.match(migration, /revoke all on table public\.lacorte_queue_product_items from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /\b(drop table|drop column|truncate|delete from public\.lacorte_queue_product_items)\b/i);
});

test('somente equipe autenticada consulta produtos e itens da comanda', () => {
  assert.match(migration, /private\.is_lacorte_staff\(\)/i);
  assert.match(migration, /lacorte_products_staff_read/i);
  assert.match(migration, /lacorte_queue_product_items_staff_read/i);
  assert.match(migration, /private\.is_lacorte_barber\(q\.barber_id\)/i);
});

test('o fechamento valida estoque, bloqueia produtos indisponíveis e registra movimentação', () => {
  assert.match(migration, /where id = v_product_id and active = true\s+for update/i);
  assert.match(migration, /v_product\.stock_quantity < v_quantity/i);
  assert.match(migration, /insert into public\.lacorte_product_stock_movements/i);
  assert.match(migration, /stock_quantity = stock_quantity - v_quantity/i);
  assert.match(migration, /perform private\.lacorte_finish_service_details_internal/i);
});

test('a comissão de produto é configurável e o padrão permanece zero', () => {
  assert.match(migration, /commission_percent numeric\(5,2\) not null default 0/i);
  assert.match(migration, /v_product_commission/i);
  assert.match(migration, /v_commission_factor/i);
  assert.match(admin, /name="commission_percent"/);
  assert.match(admin, /commission_percent:commissionPercent/);
});

test('o barbeiro inclui produtos na comanda antes de confirmar o pagamento', () => {
  assert.match(barber, /async function renderBarberPayment/);
  assert.match(barber, /data-add-product/);
  assert.match(barber, /data-product-cart/);
  assert.match(barber, /lacorte_finish_service_details_with_products/);
  assert.match(barber, /p_products:cart\.map/);
  assert.match(barber, /lacorte_queue_product_items/);
});

test('as duas entradas profissionais carregam a versão nova dos painéis', () => {
  assert.match(equipe, /barber\.js\?v=barber-comanda-20261116-1/);
  assert.match(equipe, /barber-layout\.css\?v=barber-comanda-20261116-1/);
  assert.match(equipe, /admin\.js\?v=admin-comanda-20261116-1/);
  assert.match(barbeiros, /barber\.js\?v=barber-comanda-20261116-1/);
  assert.match(barbeiros, /barber-layout\.css\?v=barber-comanda-20261116-1/);
  assert.match(barbeiros, /admin\.js\?v=admin-comanda-20261116-1/);
});
