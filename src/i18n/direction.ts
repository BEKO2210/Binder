// Which way a language runs. Pure, so it can be tested without React Native.
//
// A language is offered or it is not. Arabic sat in the picker with the whole
// interface still laid out left to right: the safety button in the corner the
// eye does not go to, the photo pager's "previous" under the thumb that means
// "next", every row starting on the wrong side. Offering a language and
// laying it out backwards is worse than not offering it.

import type { LocaleCode } from './registry.ts';

/**
 * By script, not by country: every locale written in one of these scripts runs
 * right to left, whichever region it carries.
 */
const RIGHT_TO_LEFT_LANGUAGES: readonly string[] = ['ar', 'fa', 'he', 'iw', 'ur', 'ps', 'sd', 'ug', 'yi'];

export function isRightToLeft(locale: LocaleCode | string): boolean {
  const base = String(locale).replace('_', '-').split('-')[0]?.toLowerCase() ?? '';
  return RIGHT_TO_LEFT_LANGUAGES.includes(base);
}

/**
 * Whether the layout on screen still matches the language.
 *
 * React Native decides the direction of every row, every margin and every
 * absolutely positioned corner when the app starts. Changing the language
 * changes the answer, and nothing already on screen hears about it — so the
 * app has to start again, once, and only when the two actually disagree.
 * Restarting when they already agree is a loop.
 */
export function needsDirectionRestart(locale: LocaleCode | string, layoutIsRightToLeft: boolean): boolean {
  return isRightToLeft(locale) !== layoutIsRightToLeft;
}

/**
 * Letter spacing is a Latin idea. Arabic letters join, and pulling them apart
 * breaks the joins — the word stops being a word. Negative tracking on the
 * display sizes does the same damage from the other direction.
 */
export function tracksLetters(locale: LocaleCode | string): boolean {
  return !isRightToLeft(locale);
}
