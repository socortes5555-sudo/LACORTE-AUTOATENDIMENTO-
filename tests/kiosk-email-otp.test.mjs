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

test('returning customers confirm email and legacy records require a signed claim', () => {
  const returning = app.slice(app.indexOf('function renderReturningCustomerLookup(){'), app.indexOf('function renderProfile(){'));
  const verification = app.slice(app.indexOf('function renderCustomerEmailVerification('), app.indexOf('function renderLegacyCustomerLink('));
  const legacy = app.slice(app.indexOf('function renderLegacyCustomerLink('), app.indexOf('async function kioskRequest('));
  assert.match(returning, /type="email"/);
  assert.match(returning, /action:"send_email_code"/);
  assert.match(verification, /action:"verify_email_code"/);
  assert.match(verification, /result\.needs_legacy_link/);
  assert.match(legacy, /action:"claim_legacy_customer"/);
  assert.match(legacy, /birth_date/);
});

test('backend issues lookup tokens only after email OTP verification', () => {
  const verify = kiosk.slice(kiosk.indexOf('if (action === "verify_email_code")'), kiosk.indexOf('if (action === "claim_legacy_customer")'));
  assert.match(kiosk, /authClient\.auth\.signInWithOtp/);
  assert.match(verify, /authClient\.auth\.verifyOtp/);
  assert.match(verify, /purpose === "register"/);
  assert.match(verify, /purpose === "identify"/);
  assert.match(verify, /signCustomerClaim/);
  assert.match(verify, /lacorte_user_roles/);
  assert.match(verify, /Este e-mail pertence à equipe/);
  assert.doesNotMatch(kiosk, /payload\.action === "register"/);
  assert.doesNotMatch(kiosk, /payload\.action === "identify"/);
});

test('legacy claim requires exact phone, birth date and normalized full name', () => {
  const claim = kiosk.slice(kiosk.indexOf('if (action === "claim_legacy_customer")'), kiosk.indexOf('if (payload.action === "plan")'));
  assert.match(claim, /verifyCustomerClaim/);
  assert.match(claim, /\.eq\("phone", phone\)/);
  assert.match(claim, /\.eq\("birth_date", birthDate\)/);
  assert.match(claim, /normalizePersonName\(customer\.first_name\)/);
  assert.match(claim, /normalizePersonName\(customer\.last_name\)/);
  assert.match(claim, /customer\.user_id && customer\.user_id !== claim\.userId/);
  assert.match(claim, /linkQuery\.is\("user_id", null\)/);
  assert.match(claim, /linkQuery\.is\("email", null\)/);
});
