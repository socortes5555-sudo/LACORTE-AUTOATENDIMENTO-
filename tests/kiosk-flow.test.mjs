import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const section = (start, end) => {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Início não encontrado: ${start}`);
  assert.notEqual(to, -1, `Fim não encontrado: ${end}`);
  return app.slice(from, to);
};

const serviceSelection = section('function renderServices(){', 'function renderConfirmation(){');
const confirmation = section('function renderConfirmation(){', '// ===== LA CORTE: roteamento por perfil e fila real =====');
const queueSubmission = section('async function submitQueueEntry(){', 'function renderQueueSuccess(){');
const queueSuccess = section('function renderQueueSuccess(){', '// Calcula a prévia do benefício.');

test('o cliente precisa revisar os serviços e valores antes de entrar na fila', () => {
  assert.match(serviceSelection, /REVISAR SOLICITAÇÃO/);
  assert.match(queueSubmission, /state\.participants\.some\(person=>!person\.services\.length\)/);
  assert.match(confirmation, /Confira sua solicitação/);
  assert.match(confirmation, /safe\(service\.name\)/);
  assert.match(confirmation, /money\(service\.price\)/);
  assert.match(confirmation, /money\(participantTotal\(person,index\)\)/);
  assert.match(confirmation, /money\(participantsTotal\(\)\)/);
  assert.match(confirmation, /preview\.description/);
  assert.match(confirmation, /ENTRAR NA FILA/);
  assert.match(confirmation, /submitQueueEntry/);
});

test('a entrada envia todos os serviços por pessoa e evita submissão duplicada', () => {
  assert.match(queueSubmission, /if\(state\.submitting\) return/);
  assert.match(queueSubmission, /action:"queue"/);
  assert.match(queueSubmission, /lookup_token:state\.lookupToken/);
  assert.match(queueSubmission, /request_id:state\.queueRequestId/);
  assert.match(queueSubmission, /participants:state\.participants\.map/);
  assert.match(queueSubmission, /service_ids:person\.services\.map\(service=>service\.id\)/);
  assert.match(queueSubmission, /clearKioskSelection\(\)/);
  assert.match(queueSubmission, /state\.queueTicket=result/);
  assert.match(queueSubmission, /renderQueueSuccess\(\)/);
  assert.match(queueSubmission, /Não foi possível entrar na fila/);
});

test('após confirmar a senha, o totem retorna à tela inicial em cinco segundos', () => {
  assert.match(app, /const CUSTOMER_AUTO_LOGOUT_MS = 5 \* 1000/);
  assert.match(queueSuccess, /SUA SENHA/);
  assert.match(queueSuccess, /ticket\.ticket_number/);
  assert.match(queueSuccess, /Aguardando/);
  assert.match(queueSuccess, /actions\.replaceChildren\(makeButton\("FINALIZAR",returnCustomerKioskToHome,true\)\)/);
  assert.match(queueSuccess, /setTimeout\(returnCustomerKioskToHome,CUSTOMER_AUTO_LOGOUT_MS\)/);
  assert.match(queueSuccess, /state\.customer=null/);
  assert.match(queueSuccess, /state\.lookupToken=null/);
  assert.match(queueSuccess, /state\.queueTicket=null/);
  assert.match(queueSuccess, /renderLogin\(\)/);
  assert.doesNotMatch(queueSuccess, /lacorte_queue.*delete|delete\(\).*lacorte_queue/i);
});
