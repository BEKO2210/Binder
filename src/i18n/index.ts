// Binder speaks English. Another language exists the moment somebody drops a
// translated copy of `locales/en.json` next to it and runs `npm run i18n:sync`.
//
// The rules that make that safe:
// - English is the source of truth. Every other file is compared against it.
// - A missing or empty string falls back to English, never to a raw key. A
//   half-finished translation degrades into English, it does not break a screen.
// - The picker in App settings only appears when there is something to pick.
import en from './locales/en.json' with { type: 'json' };
import { registeredLocales, type LocaleCode } from './registry.ts';

export type { LocaleCode };

export type LocaleMeta = {
  code: LocaleCode;
  name: string;
  endonym: string;
  flag: string;
};

type Dictionary = Record<string, unknown>;

const dictionaries: Record<string, Dictionary> = { en: en as Dictionary, ...registeredLocales };

export const SOURCE_LOCALE: LocaleCode = 'en';

export function availableLocales(): LocaleMeta[] {
  return Object.entries(dictionaries).map(([code, dictionary]) => {
    const meta = (dictionary.$meta ?? {}) as Partial<LocaleMeta>;
    return {
      code: code as LocaleCode,
      name: meta.name ?? code,
      endonym: meta.endonym ?? meta.name ?? code,
      flag: meta.flag ?? '',
    };
  }).sort((first, second) => first.code === SOURCE_LOCALE ? -1 : second.code === SOURCE_LOCALE ? 1 : first.endonym.localeCompare(second.endonym));
}

export function hasTranslations(): boolean {
  return availableLocales().length > 1;
}

function lookup(dictionary: Dictionary | undefined, key: string): string | undefined {
  if (!dictionary) return undefined;
  let current: unknown = dictionary;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Dictionary)[part];
  }
  return typeof current === 'string' && current.trim().length > 0 ? current : undefined;
}

/**
 * Resolve one key for one locale.
 *
 * `values` fills `{name}` style placeholders. Placeholders are the only
 * substitution: a translator never has to guess at concatenated sentences.
 */
export function translate(locale: LocaleCode, key: string, values?: Record<string, string | number>): string {
  const text = lookup(dictionaries[locale], key) ?? lookup(dictionaries[SOURCE_LOCALE], key) ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

export function resolveLocale(preference: 'system' | LocaleCode, deviceLanguage: string | undefined): LocaleCode {
  if (preference !== 'system') return dictionaries[preference] ? preference : SOURCE_LOCALE;
  const short = (deviceLanguage ?? '').slice(0, 2).toLowerCase();
  return short && dictionaries[short] ? (short as LocaleCode) : SOURCE_LOCALE;
}
