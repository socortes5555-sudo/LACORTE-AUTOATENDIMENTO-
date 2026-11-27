import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isValidEmail,
  normalizeEmail,
  normalizeBrazilPhone,
  normalizePersonName,
  signCustomerClaim,
  verifyCustomerClaim,
} from '../supabase/functions/lacorte-kiosk/validation.mjs';

const app = readFileSync('app.js', 'utf8');
const kiosk = readFileSync('supabase/functions/lacorte-kiosk/index.ts', 'utf8');

test('normalizes and validates customer email addresses', () => {
  assert.equal(normalizeEmail('  Cliente@Exemplo.COM  '), 'cliente@exemplo.com');
  assert.equal(isValidEmail('cliente@exemplo.com'), true);
  for (const value of ['', 'sem-arroba.example.com', 'x@', 'x@@example.com', 'x@example', 'x..y@example.com', null]) {
    assert.equal(isValidEmail(value), false, String(value));
  }
});

test('normalizes Brazilian phones without accepting incomplete DDD numbers', () => {
  assert.equal(normalizeBrazilPhone('(48) 99942-6466'), '+5548999426466');
  assert.equal(normalizeBrazilPhone('+55 48 99942-6466'), '+5548999426466');
  assert.equal(normalizeBrazilPhone('489994266'), '');
});

test('normalizes legacy customer names consistently', () => {
  assert.equal(normalizePersonName('  João   da  Silva '), 'joão da silva');
});

test('customer claim tokens are signed, short-lived and bound to email and user', async () => {
  const token = await signCustomerClaim('123e4567-e89b-12d3-a456-426614174000', 'cliente@example.com', 200000, 'test-secret');
  assert.deepEqual(await verifyCustomerClaim(token, 'test-secret', 100000), {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    email: 'cliente@example.com',
  });
  assert.equal(await verifyCustomerClaim(token, 'wrong-secret', 100000), null);
  assert.equal(await verifyCustomerClaim(token, 'test-secret', 200001), null);
  assert.equal(await verifyCustomerClaim(token + 'x', 'test-secret', 100000), null);
});

test('new registration asks for email code before saving customer data', () => {
  const profile = app.slice(app.indexOf('function renderProfile(){'), app.indexOf('function renderCustomerEmailVerification('));
  assert.match(profile, /type="email"/);
  assert.match(profile, /action:"send_email_code"/);
  assert.match(profile, /state\.pendingRegistration=registration/);
  assert.match(profile, /renderCustomerEmailVerification\(registration\.email,"register",registration\)/);
  assert.doesNotMatch(profile, /action:"register"/);
});

test('returning customers keep name or phone lookup and verify the linked email without exposing it', () => {
  const returning = app.slice(app.indexOf('function renderReturningCustomerLookup(){'), app.indexOf('function renderLegacyCustomerStart(){'));
  const verification = app.slice(app.indexOf('function renderCustomerEmailVerification('), app.indexOf('function renderLegacyCustomerLink('));
  const legacyStart = app.slice(app.indexOf('function renderLegacyCustomerStart(){'), app.indexOf('function renderProfile(){'));
  const legacy = app.slice(app.indexOf('function renderLegacyCustomerLink('), app.indexOf('async function kioskRequest('));
  assert.match(returning, /id="customer-identifier" type="text"/);
  assert.match(returning, /purpose:"identify",identifier:identifier/);
  assert.doesNotMatch(returning, /type="email"/);
  assert.match(verification, /id="customer-email"/);
  assert.match(verification, /request\\.identifier=state\\.pendingIdentifier/);
  assert.match(legacyStart, /purpose:"claim",email:email/);
  assert.match(verification, /result\.needs_legacy_link/);
  assert.match(legacy, /action:"claim_legacy_customer"/);
  assert.match(legacy, /birth_date/);
});

test('backend issues lookup tokens only after email OTP verification', () => {
  const verify = kiosk.slice(kiosk.indexOf('if (action === "verify_email_code")'), kiosk.lastIndexOf('if (action === "claim_legacy_customer")'));
  assert.match(kiosk, /authClient\.auth\.signInWithOtp/);
  assert.match(verify, /authClient\.auth\.verifyOtp/);
  assert.match(verify, /\["register", "identify", "claim"\]\.includes\(purpose\)/);
  assert.match(verify, /if \(purpose === "register"\)/);
  assert.match(verify, /signCustomerClaim/);
  assert.match(verify, /lacorte_user_roles/);
  assert.match(verify, /Este e-mail pertence à equipe/);
  assert.doesNotMatch(kiosk, /payload\.action === "register"/);
  assert.doesNotMatch(kiosk, /payload\.action === "identify"/);
});


test('existing-customer OTP is sent only after server-side name or phone lookup', () => {
  const send = kiosk.slice(kiosk.indexOf('if (action === "send_email_code")'), kiosk.indexOf('if (action === "verify_email_code")'));
  assert.match(send, /findCustomerByIdentifier\(String\(payload\.identifier/);
  assert.match(send, /found\.customer\.email/);
  assert.match(send, /authClient\.auth\.signInWithOtp/);
  assert.match(send, /return reply\(200, \{ ok: true \}\)/);
  assert.doesNotMatch(send, /return reply\(200, \{[^}]*email:/);
});

test('existing-customer OTP verification rechecks identifier, linked email and user ownership', () => {
  const verify = kiosk.slice(kiosk.indexOf('if (action === "verify_email_code")'), kiosk.lastIndexOf('if (action === "claim_legacy_customer")'));
  assert.match(verify, /purpose === "identify"/);
  assert.match(verify, /findCustomerByIdentifier\(String\(payload\.identifier/);
  assert.match(verify, /normalizeEmail\(customer\.email\) !== email/);
  assert.match(verify, /customer\.user_id && customer\.user_id !== authUser\.id/);
  assert.match(verify, /linkedByUser && linkedByUser\.id !== customer\.id/);
});

test('legacy email claim is explicit and cannot reuse an email already linked to a customer', () => {
  const send = kiosk.slice(kiosk.indexOf('if (action === "send_email_code")'), kiosk.indexOf('if (action === "verify_email_code")'));
  const verify = kiosk.slice(kiosk.indexOf('if (action === "verify_email_code")'), kiosk.lastIndexOf('if (action === "claim_legacy_customer")'));
  assert.match(send, /purpose === "claim"/);
  assert.match(send, /existingEmail/);
  assert.match(verify, /purpose === "claim"/);
  assert.match(verify, /signCustomerClaim/);
});

test('legacy claim requires exact phone, birth date and normalized full name', () => {
  const claim = kiosk.slice(kiosk.lastIndexOf('if (action === "claim_legacy_customer")'), kiosk.indexOf('if (payload.action === "plan")'));
  assert.match(claim, /verifyCustomerClaim/);
  assert.match(claim, /\.eq\("phone", phone\)/);
  assert.match(claim, /\.eq\("birth_date", birthDate\)/);
  assert.match(claim, /normalizePersonName\(customer\.first_name\)/);
  assert.match(claim, /normalizePersonName\(customer\.last_name\)/);
  assert.match(claim, /customer\.user_id && customer\.user_id !== claim\.userId/);
  assert.match(claim, /linkQuery\.is\("user_id", null\)/);
  assert.match(claim, /linkQuery\.is\("email", null\)/);
});

test('OTP verification never exposes Supabase session credentials to the kiosk', () => {
  assert.doesNotMatch(kiosk, /access_token|refresh_token/);
  const verify = kiosk.slice(kiosk.indexOf('if (action === "verify_email_code")'), kiosk.lastIndexOf('if (action === "claim_legacy_customer")'));
  assert.match(verify, /lookup_token:/);
  assert.doesNotMatch(verify, /session:\s*verified\.data|verified\.data\.session\s*[,}]/);
});

test('OTP throttling separates lookup identifiers, registration emails and legacy claims', () => {
  assert.match(kiosk, /payload\.purpose === "identify" \? "identify" : "register"/);
  assert.match(kiosk, /p_action: "identify_identifier"/);
  assert.match(kiosk, /identifier:" \+ identifier\.toLocaleLowerCase\("pt-BR"\)/);
  assert.match(kiosk, /purpose === "claim" \? "identify_identifier" : "register"/);
});

test('falha no envio de OTP mantém cadastro e identificação bloqueados sem expor detalhes do SMTP', () => {
  const send = kiosk.slice(
    kiosk.indexOf('if (action === "send_email_code")'),
    kiosk.indexOf('if (action === "verify_email_code")')
  );
  assert.match(send, /if \(!authClient\) return reply\(500/);
  assert.match(send, /if \(error\) return reply\(503/);
  assert.match(send, /return reply\(200, \{ ok: true \}\)/);
  assert.doesNotMatch(send, /\.insert\(|error\.message/);

  const profile = app.slice(app.indexOf('function renderProfile(){'), app.indexOf('function renderCustomerEmailVerification('));
  const returning = app.slice(app.indexOf('function renderReturningCustomerLookup(){'), app.indexOf('function renderProfile(){'));
  for (const form of [profile, returning]) {
    const catchStart = form.indexOf('}catch(error){');
    assert.notEqual(catchStart, -1, 'o formulário precisa tratar falhas de envio');
    const failurePath = form.slice(catchStart);
    assert.match(failurePath, /showMessage\(error\.message/);
    assert.match(failurePath, /button\.disabled=false/);
    assert.doesNotMatch(failurePath, /renderCustomerEmailVerification|continueKioskCustomer/);
  }
});
