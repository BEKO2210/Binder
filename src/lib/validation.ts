export type Gender = 'woman' | 'man' | 'nonbinary';

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
];

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
