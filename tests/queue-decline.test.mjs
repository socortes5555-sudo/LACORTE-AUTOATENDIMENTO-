import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const barber = readFileSync('barber.js', 'utf8');
const admin = readFileSync('admin.js', 'utf8');

test('o botão de recusa persiste a preferência pela RPC protegida', () => {
  const dialog = app.slice(app.indexOf('function openQueueCallDialog('), app.indexOf('async function openPaymentMethodDialog('));
  assert.ok(dialog.includes('data-decline'));
  assert.ok(dialog.includes('db.rpc("lacorte_decline_queue_entry",{p_queue_id:queueId})'));
  assert.ok(dialog.includes('result.error'));
  assert.ok(dialog.includes('Não foi possível manter a senha aguardando'));
});

test('a fila individual oculta apenas as senhas recusadas pelo barbeiro atual', () => {
  assert.ok(barber.includes("row.status==='waiting'&&!(row.declinedBarberIds||[]).includes(String(state.barberId))"));
});

test('a consulta compartilhada carrega as recusas permitidas pela RLS', () => {
  assert.ok(app.includes("db.from('lacorte_queue_declines').select('queue_id,barber_id,declined_at')"));
  assert.ok(app.includes('declinedBarberIds:rowDeclines.map'));
});

test('a administração identifica quantos profissionais pularam cada senha', () => {
  assert.ok(admin.includes('row.declinedBarberIds'));
  assert.ok(admin.includes('row.declinedBarberNames'));
  assert.ok(admin.includes('Já pulada por'));
});

test('as atualizações de recusa renovam os painéis em tempo real', () => {
  assert.ok(app.includes('table:"lacorte_queue_declines"'));
});
