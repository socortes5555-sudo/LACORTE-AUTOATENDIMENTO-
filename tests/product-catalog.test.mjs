import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync('admin.js', 'utf8');
const migration = readFileSync('supabase/migrations/20261115171140_lacorte_product_catalog_inventory.sql', 'utf8');
const equipe = readFileSync('equipe/index.html', 'utf8');
const barbeiros = readFileSync('barbeiros.html', 'utf8');

test('o catálogo de produtos está disponível nas configurações administrativas', () => {
  assert.ok(admin.includes('"Produtos e estoque": renderAdminProducts'));
  assert.ok(admin.includes('async function renderAdminProducts(target)'));
  assert.ok(admin.includes('db.from("lacorte_products").select'));
});

test('o administrador consegue cadastrar e atualizar produtos sem apagar registros', () => {
  assert.ok(admin.includes('db.from("lacorte_products").insert'));
  assert.ok(admin.includes('db.from("lacorte_products").update'));
  assert.ok(admin.includes('data-product-form'));
  assert.ok(!admin.includes('data-delete-product'));
});

test('as entradas e saídas de estoque usam a operação protegida e exigem motivo', () => {
  assert.ok(admin.includes('db.rpc("lacorte_admin_adjust_product_stock"'));
  assert.ok(admin.includes('p_quantity_delta:delta'));
  assert.ok(admin.includes('p_reason:reason'));
  assert.ok(admin.includes('data-stock-form'));
});

test('a migração cria catálogo e histórico com restrições de quantidade e preço', () => {
  assert.match(migration, /create table if not exists public\.lacorte_products/i);
  assert.match(migration, /price numeric\(10,2\) not null check \(price >= 0\)/i);
  assert.match(migration, /stock_quantity integer not null default 0 check \(stock_quantity >= 0\)/i);
  assert.match(migration, /create table if not exists public\.lacorte_product_stock_movements/i);
  assert.match(migration, /references public\.lacorte_products\(id\) on delete restrict/i);
});

test('somente administradores leem e alteram o catálogo', () => {
  assert.match(migration, /using \(private\.is_lacorte_admin\(\)\)/i);
  assert.match(migration, /with check \(private\.is_lacorte_admin\(\)\)/i);
  assert.match(migration, /grant insert \(name, description, sku, price, active\)/i);
  assert.match(migration, /grant update \(name, description, sku, price, active\)/i);
  assert.doesNotMatch(migration, /grant update[^;]*stock_quantity/i);
});

test('movimentações são append-only e registradas pela função administrativa', () => {
  assert.match(migration, /revoke all on table public\.lacorte_product_stock_movements from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.lacorte_product_stock_movements to authenticated/i);
  assert.match(migration, /insert into public\.lacorte_product_stock_movements/i);
  assert.match(migration, /created_by uuid not null references auth\.users\(id\) on delete restrict/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /v_new_stock < 0/i);
  assert.match(migration, /private\.is_lacorte_admin\(\)/i);
});

test('a migração é aditiva e não apaga dados ou estruturas', () => {
  assert.doesNotMatch(migration, /\b(drop table|drop column|truncate|delete from)\b/i);
});

test('as duas entradas da equipe carregam a versão atualizada do painel administrativo', () => {
  assert.match(equipe, /admin\.js\?v=[^"\s]+/);
  assert.match(barbeiros, /admin\.js\?v=[^"\s]+/);
});
