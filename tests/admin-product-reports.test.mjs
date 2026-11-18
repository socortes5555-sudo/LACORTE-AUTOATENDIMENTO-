import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync('admin.js', 'utf8');
const helperStart = admin.indexOf('function summarizeAdminProductSales');
const helperEnd = admin.indexOf('async function renderAdminReports', helperStart);
const helper = admin.slice(helperStart, helperEnd);

test('relatórios consultam os snapshots históricos dos produtos vendidos', () => {
  assert.match(admin, /db\.from\("lacorte_queue_product_items"\)\.select\("queue_id,product_name_snapshot,sku_snapshot,quantity,unit_price,line_total,commission_percent_snapshot"\)/);
  assert.match(admin, /lookups\[3\]\.error/);
  assert.match(admin, /productItemsByQueue/);
});

test('faturamento de produtos é separado de serviços e respeita o desconto do atendimento', () => {
  assert.match(helper, /row\.gross_amount \?\? row\.total_amount/);
  assert.match(helper, /row\.discount_amount/);
  assert.match(helper, /item\.line_total/);
  assert.match(helper, /netFactor/);
  assert.match(admin, /serviceGrossRevenue/);
  assert.match(admin, /serviceNetRevenue/);
  assert.match(admin, /productSales\.gross/);
  assert.match(admin, /productSales\.net/);
});

test('os relatórios usam nome, preço e quantidade históricos, sem consultar o catálogo atual', () => {
  assert.match(helper, /product_name_snapshot/);
  assert.match(helper, /item\.quantity/);
  assert.match(helper, /item\.unit_price/);
  assert.doesNotMatch(helper, /lacorte_products|stock_quantity/);
});

test('o histórico administrativo mostra quantidade e detalhes dos produtos da comanda', () => {
  assert.match(admin, /const soldProductQuantity = soldProducts\.reduce/);
  assert.match(admin, /soldProductQuantity/);
  assert.match(admin, /const productLines = soldProducts\.map/);
  assert.match(admin, /aria-label="Produtos vendidos"/);
  assert.match(admin, /Number\(item\.quantity\)/);
  assert.match(admin, /product_name_snapshot/);
});

test('o painel apresenta ranking e lista de produtos vendidos no período', () => {
  assert.match(admin, /PRODUTOS VENDIDOS NO PERÍODO/);
  assert.match(admin, /PRODUTOS MAIS VENDIDOS/);
  assert.match(admin, /productSales\.items\.slice\(0,8\)/);
  assert.match(admin, /Nenhum produto vendido neste período/);
});
