export type Gender = 'woman' | 'man' | 'nonbinary';

// The value is what the database stores and what discovery matches on; the
// label is what a person reads. Only the second one is translated — swapping
// the stored value for a translated word would stop existing profiles from
// matching each other.
export const GENDERS: { value: Gender; labelKey: string }[] = [
  { value: 'woman', labelKey: 'identity.gender.woman' },
  { value: 'man', labelKey: 'identity.gender.man' },
  { value: 'nonbinary', labelKey: 'identity.gender.nonbinary' },
];

// Same split as the genders, and for the same reason: these strings are stored
// in every profile row and compared across accounts, so the value stays English
// for good. `interestLabelKey` is how a screen asks for the readable version.
export const INTERESTS = [
  'Travel',
  'Music',
  'Fitness',
  'Food',
  'Design',
  'Tech',
  'Photography',
  'Hiking',
  'Coffee',
  'Books',
  'Gaming',
  'Dogs',
] as const;

export type Interest = (typeof INTERESTS)[number];

export function interestLabelKey(interest: string): string {
  return `identity.interests.${interest.charAt(0).toLowerCase()}${interest.slice(1)}`;
}

/**
 * The readable form of a stored interest, falling back to the stored word.
 *
 * Profiles hold whatever list was current when they were filled in, so a value
 * with no translation is a real possibility — and `translate` returns the key
 * itself when it finds nothing, which would put "identity.interests.knitting"
 * on somebody's profile. Showing the English word is worse than a translation
 * and much better than that.
 */
export function interestLabel(translate: (key: string) => string, interest: string): string {
  const key = interestLabelKey(interest);
  const label = translate(key);
  return label === key ? interest : label;
}

export function parseBirthDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function ageAt(birthDate: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

export function validateAdultBirthDate(value: string, now = new Date()): string | null {
  const date = parseBirthDate(value);
  if (!date) return 'Use YYYY-MM-DD.';
  const age = ageAt(date, now);
  if (age < 18) return 'Binder is only available to adults 18+.';
  if (age > 100) return 'Enter a valid birth date.';
  return null;
}
