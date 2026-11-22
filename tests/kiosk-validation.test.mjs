import test from 'node:test';
import assert from 'node:assert/strict';
import { currentBrazilDate, isValidBirthDate } from '../supabase/functions/lacorte-kiosk/validation.mjs';

test('accepts real calendar dates including leap day', () => {
  assert.equal(isValidBirthDate('2024-02-29', '2026-11-22'), true);
  assert.equal(isValidBirthDate('2000-01-01', '2026-11-22'), true);
  assert.equal(isValidBirthDate('2026-11-22', '2026-11-22'), true);
});

test('rejects impossible calendar dates and malformed values', () => {
  for (const value of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-1-01', '', null, 20200101]) {
    assert.equal(isValidBirthDate(value, '2026-11-22'), false, String(value));
  }
});

test('rejects birth dates after the current business date', () => {
  assert.equal(isValidBirthDate('2026-11-23', '2026-11-22'), false);
  assert.equal(isValidBirthDate('2027-01-01', '2026-11-22'), false);
});

test('calculates the business date in Sao Paulo around UTC midnight', () => {
  assert.equal(currentBrazilDate(new Date('2026-11-22T02:30:00.000Z')), '2026-11-21');
  assert.equal(currentBrazilDate(new Date('2026-11-22T03:30:00.000Z')), '2026-11-22');
});