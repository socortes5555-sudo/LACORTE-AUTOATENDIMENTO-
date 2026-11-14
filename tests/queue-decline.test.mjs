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
  assert.ok(app.includes("db.from('lacorte_queue_declines').select('queue_id,barber_id,declined_at,resolved_at,resolved_by,resolution_reason')"));
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


const resolutionMigration = readFileSync('supabase/migrations/20261114140724_admin_queue_decline_resolution.sql', 'utf8');

test('a administração identifica quando todos os profissionais ativos pularam a senha', () => {
  assert.ok(admin.includes('allActiveBarbersDeclined'));
  assert.ok(admin.includes('data-resolve-declines'));
  assert.ok(admin.includes('Cliente confirmou que aceita ser atendido por este profissional'));
  assert.ok(admin.includes('lacorte_admin_resolve_queue_decline'));
});

test('a consulta distingue recusas pendentes das preferências reabertas', () => {
  assert.ok(app.includes('pendingDeclines=rowDeclines.filter(d=>!d.resolved_at)'));
  assert.ok(app.includes('resolvedBarberNames:resolvedDeclines.map'));
  assert.ok(app.includes('declinedBarberIds:pendingDeclines.map'));
});

test('a resolução exige administrador, confirmação do cliente e que todos os barbeiros ativos tenham pulado a senha', () => {
  assert.match(resolutionMigration, /private\\.is_lacorte_admin\\(\\)/);
  assert.match(resolutionMigration, /p_customer_confirmed is distinct from true/);
  assert.match(resolutionMigration, /b\\.active is true[\\s\\S]*not exists[\\s\\S]*d\\.resolved_at is null/);
  assert.match(resolutionMigration, /insert into public\\.lacorte_queue_decline_resolutions/);
  assert.match(resolutionMigration, /resolved_by = auth\\.uid\\(\\)/);
});

test('a recusa pode voltar a ficar pendente sem apagar o histórico de resoluções', () => {
  assert.match(resolutionMigration, /on conflict \\(queue_id, barber_id\\) do update/);
  assert.match(resolutionMigration, /lacorte_queue_decline_resolutions/);
  assert.match(resolutionMigration, /set declined_at = excluded\\.declined_at[\\s\\S]*resolved_at = null/);
});

test('o barbeiro só fica impedido de iniciar enquanto a recusa estiver pendente', () => {
  const startFunction = resolutionMigration.slice(resolutionMigration.indexOf('create or replace function private.lacorte_start_service_internal'));
  assert.match(startFunction, /d\\.resolved_at is null/);
});

test('a migração é aditiva e não apaga filas ou históricos', () => {
  assert.match(resolutionMigration, /add column if not exists resolved_at/);
  assert.match(resolutionMigration, /create table if not exists public\\.lacorte_queue_decline_resolutions/);
  assert.doesNotMatch(resolutionMigration, /\\b(drop|truncate)\\b/i);
});
