import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  const bundled = new Set(availableLocales().map((locale) => locale.code));
  // German and French are bundled today; the point of the test is the rule, so
  // it asserts against what is actually registered rather than a fixed list.
  assert.equal(resolveLocale('system', 'de-DE'), bundled.has('de') ? 'de' : 'en');
  assert.equal(resolveLocale('system', 'fr-CA'), bundled.has('fr') ? 'fr' : 'en');
  assert.equal(resolveLocale('system', 'en-GB'), 'en');
  assert.equal(resolveLocale('system', undefined), 'en');
  // A language nobody bundled must not strand the interface.
  assert.equal(resolveLocale('sv' as never, 'de-DE'), 'en');
});

test('a regional file serves the whole language', () => {
  const bundled = new Set(availableLocales().map((locale) => locale.code));
  if (!bundled.has('pt-BR')) return;
  // Exact tag, a different region of the same language, and the bare language
  // all have to land on the file that exists.
  assert.equal(resolveLocale('system', 'pt-BR'), 'pt-BR');
  assert.equal(resolveLocale('system', 'pt-PT'), 'pt-BR');
  assert.equal(resolveLocale('system', 'pt'), 'pt-BR');
  assert.equal(resolveLocale('system', 'de_DE'), 'de', 'an underscore tag still resolves');
});

test('nothing decides anything by matching a translated string', () => {
  // App settings picked the tone of its status line with /are active|are off/.
  // In English a success read as a success; in the other fourteen languages it
  // read as a failure and was painted in the destructive colour. Whatever
  // happened is known at the place it happens — it must not be recovered by
  // looking at words that change with the locale.
  const offenders: string[] = [];
  // Root.tsx renders too, and leaving it out here is how the tab bar shipped
  // in English: a gate that skips a file cannot protect it.
  const roots = ['src/screens', 'src/components', 'src'];
  const seen = new Set<string>();
  for (const dir of roots) {
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true })) {
      const name = String(entry);
      if (!name.endsWith('.tsx')) continue;
      const path = `${dir}/${name}`;
      if (seen.has(path)) continue;
      seen.add(path);
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      // A literal regex, or a string comparison, applied to a value the
      // translator owns. The name has to BE one of these words, so that
      // messageId, labelKey and textInput stay out of it.
      const owned = /^(message|copy|label|title|text|body|caption)$/i;
      const patterns = [
        /\/[^/\n]*\p{L}{3}[^/\n]*\/[a-z]*\.test\(\s*([A-Za-z_$][\w$]*)/gu,
        /\b([A-Za-z_$][\w$]*)\.(?:includes|startsWith|endsWith|match)\(\s*['"`]\p{L}{3}/gu,
      ];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          if (owned.test(match[1] ?? '')) offenders.push(`${path}: ${match[0]}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('every language can write every kind of notification', () => {
  // These are shown by the phone itself, outside the app, and they used to be
  // English literals in the database for all fifteen languages.
  const kinds = ['newMatch', 'newMessage', 'moderationStatus', 'safetyAlert', 'productNotice'];
  for (const { code } of availableLocales()) {
    for (const kind of kinds) {
      for (const part of ['title', 'body']) {
        const value = translate(code, `push.${kind}.${part}`);
        assert.ok(value && !value.startsWith('push.'), `${code} is missing push.${kind}.${part}`);
      }
    }
  }
});

test('nothing a person reads is hard-coded outside the locale files', () => {
  // The localisation gate scans .tsx, so English sitting in a .ts module was
  // invisible to it — that is how the interests, the genders, the discovery
  // presets, the notification channels and every network error message stayed
  // English in all fifteen languages. These are the modules that feed labels to
  // a screen; they may hold keys, not sentences.
  const offenders: string[] = [];
  const modules = ['validation.ts', 'discoveryPreferencesPolicy.ts', 'reliability.ts', 'notifications.ts'];
  for (const name of modules) {
    const source = readFileSync(new URL(`../src/lib/${name}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\b(label|name|description|message|title|copy)\s*:\s*'([^']{4,})'/g)) {
      // A key is fine. A sentence is not.
      if (/^[a-z][A-Za-z]*(\.[A-Za-z]+)+$/.test(match[2])) continue;
      offenders.push(`src/lib/${name}: ${match[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
