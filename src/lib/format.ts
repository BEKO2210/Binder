export type DayLabel = 'today' | 'yesterday' | string;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolvedLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale;
}

export function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(resolvedLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function formatDayLabel(date: Date, locale: string, now: Date): DayLabel {
  const calendarDaysAgo = Math.round((startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / 86_400_000);
  if (calendarDaysAgo === 0) return 'today';
  if (calendarDaysAgo === 1) return 'yesterday';
  if (calendarDaysAgo >= 2 && calendarDaysAgo <= 7) return new Intl.DateTimeFormat(resolvedLocale(locale), { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat(resolvedLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function formatDistanceKm(km: number, locale: string): string {
  return new Intl.NumberFormat(resolvedLocale(locale), { maximumFractionDigits: 1 }).format(km);
}

export function formatCount(n: number, locale: string): string {
  return new Intl.NumberFormat(resolvedLocale(locale)).format(n);
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(resolvedLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/**
 * Upper case, in the language's own rules.
 *
 * `toUpperCase()` is English's rules wearing everybody else's clothes: Turkish
 * writes the capital of "i" as "İ", and a dotless "I" is a different letter
 * with a different sound. A name in an eyebrow read as somebody else's name.
 * Scripts without case — Arabic, Japanese, Chinese — are returned untouched,
 * which is what the locale-aware call already does.
 */
export function upperCase(text: string, locale: string): string {
  return text.toLocaleUpperCase(resolvedLocale(locale));
}

/**
 * The first character of a name, as a reader would point at it.
 *
 * `slice(0, 1)` takes one UTF-16 code unit, which is not a letter: it cuts a
 * name beginning outside the basic plane in half and hands the avatar a broken
 * glyph, and it separates a Devanagari consonant from the vowel sign that
 * belongs to it. A grapheme is the unit a person calls a character.
 */
export function firstLetter(name: string, locale: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // A whole code point to start with: slicing by one gives half a surrogate
  // pair on anything outside the basic plane, which draws as a broken glyph.
  // `trimmed` is not empty, so there is one.
  let head = String.fromCodePoint(trimmed.codePointAt(0) as number);
  const segmenter = (Intl as { Segmenter?: new (locale: string, options: { granularity: string }) => { segment: (text: string) => Iterable<{ segment: string }> } }).Segmenter;
  try {
    // A grapheme, where the engine can tell us what one is: in Devanagari the
    // vowel sign belongs to the consonant in front of it. The code point is
    // appended as the last candidate rather than guarded with a branch nothing
    // can reach — a non-empty string always segments into at least one piece.
    const parts = segmenter ? [...new segmenter(resolvedLocale(locale), { granularity: 'grapheme' }).segment(trimmed)] : [];
    head = [...parts, { segment: head }][0]!.segment;
  } catch { /* the code point stands */ }
  return upperCase(head, locale);
}
