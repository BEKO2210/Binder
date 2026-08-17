import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageOn, assessBirthDate, composeBirthDate, sanitizeDigits } from '../src/lib/birthdate.ts';

const ref = new Date('2026-08-16T12:00:00Z');

test('segments accept digits only and clip to their length', () => {
  assert.equal(sanitizeDigits('1a9b9c5d', 4), '1995');
  assert.equal(sanitizeDigits('..3', 2), '3');
});

test('impossible calendar dates never compose', () => {
  assert.equal(composeBirthDate('31', '02', '1995'), null);
  assert.equal(composeBirthDate('29', '02', '1999'), null);
  assert.equal(composeBirthDate('29', '02', '2000'), '2000-02-29');
});

test('age counts completed years around the birthday', () => {
  assert.equal(ageOn('1995-08-16', ref), 31);
  assert.equal(ageOn('1995-08-17', ref), 30);
  assert.equal(ageOn('1995-02-31', ref), null);
  assert.equal(ageOn('1995-08-16T00:00:00Z', ref), null);
});

test('assessment walks incomplete, invalid, underage and ok', () => {
  assert.equal(assessBirthDate('', '', '', ref).kind, 'incomplete');
  assert.equal(assessBirthDate('31', '02', '1995', ref).kind, 'invalid');
  assert.equal(assessBirthDate('17', '08', '2008', ref).kind, 'underage');
  assert.equal(assessBirthDate('16', '08', '2008', ref).kind, 'ok');
  const ok = assessBirthDate('23', '04', '1995', ref);
  assert.deepEqual(ok, { kind: 'ok', iso: '1995-04-23', age: 31 });
});

test('a century-old date is treated as implausible input', () => {
  assert.equal(assessBirthDate('01', '01', '1920', ref).kind, 'implausible');
});
