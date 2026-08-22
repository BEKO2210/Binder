import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageOn, assessBirthDate, composeBirthDate, sanitizeDigits } from '../src/lib/birthdate.ts';

// Midday on the sixteenth, on the phone's own calendar. An instant in UTC
// would make these assertions depend on where the machine running them is,
// which is the whole of what the age rule got wrong.
const ref = new Date(2026, 7, 16, 12, 0);

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

test('age is counted on the calendar the person is standing in', () => {
  // Read in UTC, a birthday moves by up to a day: in UTC-12 somebody turned
  // eighteen half a day early, in UTC+14 they were still seventeen on the
  // morning of it. The server refuses either way; this is the number the
  // person is shown before they are let in or turned away.
  const local = (year: number, month: number, day: number, hour: number, minute: number) => new Date(year, month - 1, day, hour, minute);
  // The evening before an eighteenth birthday, wherever the phone is.
  assert.equal(ageOn('2008-08-17', local(2026, 8, 16, 23, 30)), 17);
  // And the first minute of it.
  assert.equal(ageOn('2008-08-17', local(2026, 8, 17, 0, 1)), 18);
  assert.equal(assessBirthDate('17', '08', '2008', local(2026, 8, 16, 23, 30)).kind, 'underage');
  assert.equal(assessBirthDate('17', '08', '2008', local(2026, 8, 17, 0, 1)).kind, 'ok');
});
