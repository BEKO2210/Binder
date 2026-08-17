import assert from 'node:assert/strict';
import { test } from 'node:test';

import { availableLocales, resolveLocale, SOURCE_LOCALE, translate } from '../src/i18n/index.ts';

test('English is always present and is the source of truth', () => {
  const locales = availableLocales();
  assert.equal(SOURCE_LOCALE, 'en');
  assert.ok(locales.some((locale) => locale.code === 'en'));
  assert.equal(locales[0]?.code, 'en', 'the source language sorts first in the picker');
});

test('a key resolves to its English string', () => {
  assert.equal(translate('en', 'settings.reset.confirm'), 'Reset');
  assert.equal(translate('en', 'common.retry'), 'Try again');
});

test('an unknown key returns the key rather than an empty screen', () => {
  assert.equal(translate('en', 'settings.nothing.here'), 'settings.nothing.here');
});

test('placeholders are filled, and an unknown placeholder is left alone', () => {
  assert.equal(translate('en', 'settings.quietHours.invalid'), 'Use HH:MM');
  const filled = translate('en', 'common.loading', { unused: 'x' });
  assert.equal(filled, 'Loading…');
});

test('the device language only wins when Binder actually has it', () => {
  assert.equal(resolveLocale('system', 'de-DE'), 'en', 'no German file registered yet');
  assert.equal(resolveLocale('system', 'en-GB'), 'en');
  assert.equal(resolveLocale('system', undefined), 'en');
  // A pinned language that is not bundled must not strand the interface.
  assert.equal(resolveLocale('fr' as never, 'de-DE'), 'en');
});
