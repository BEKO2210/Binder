// How many is "many" depends on the language.
//
// Every count in the app used `count === 1 ? one : other`, which is the rule
// for English and for about half the languages that ship. Polish has a form
// for 2–4 and another for the rest. Arabic has six, including one for nothing
// at all and one for 11–99. Those languages were reading a sentence built for
// a number that was not theirs.

import type { LocaleCode } from './registry.ts';

/** The CLDR categories, in the order a translator meets them. */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export function isPluralCategory(value: string): value is PluralCategory {
  return (PLURAL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The categories a language actually distinguishes.
 *
 * Hermes carries Intl on Android, but a runtime without it must not take the
 * screen down over a word — English's two forms are the fallback, and every
 * language has `other`.
 */
export function pluralCategoriesFor(locale: LocaleCode | string): PluralCategory[] {
  try {
    const categories = new Intl.PluralRules(String(locale)).resolvedOptions().pluralCategories;
    const known = categories.filter(isPluralCategory);
    if (known.length > 0) return PLURAL_CATEGORIES.filter((category) => known.includes(category));
  } catch { /* fall through */ }
  return ['one', 'other'];
}

/** Which form this exact number takes in this language. */
export function pluralCategory(locale: LocaleCode | string, count: number): PluralCategory {
  try {
    const category = new Intl.PluralRules(String(locale)).select(count);
    if (isPluralCategory(category)) return category;
  } catch { /* fall through */ }
  return count === 1 ? 'one' : 'other';
}

/**
 * The key to read for this count, given what the language actually has.
 *
 * `other` is the one form every language carries, so it is what a missing form
 * falls back to — a sentence in the wrong number beats a raw key on screen.
 */
export function pluralKey(
  base: string,
  locale: LocaleCode | string,
  count: number,
  exists: (key: string) => boolean,
): string {
  const category = pluralCategory(locale, count);
  const candidate = `${base}.${category}`;
  if (exists(candidate)) return candidate;
  return `${base}.other`;
}
