import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const start = app.indexOf('function renderReturningCustomerLookup(){');
const end = app.indexOf('function renderProfile(){', start + 1);
assert.notEqual(start, -1, 'A tela de clientes recorrentes precisa existir.');
assert.notEqual(end, -1, 'A tela de cadastro novo precisa existir.');
const returning = app.slice(start, end);

test('cliente recorrente continua localizando o cadastro por nome completo ou telefone', () => {
  assert.match(returning, /id="customer-identifier"/);
  assert.match(returning, /Nome completo ou celular/);
  assert.match(returning, /Seu nome completo ou \(48\) 99999-9999/);
  assert.match(returning, /document\.querySelector\("#customer-identifier"\)\.value\.trim\(\)/);
  assert.match(returning, /kioskRequest\(\{[\s\S]*identifier\s*:/);
  assert.doesNotMatch(returning, /id="customer-email"/);
});
