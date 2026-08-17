// Pure birth-date segment logic for the onboarding input (DD · MM · YYYY with
// auto-advance and a live age chip). No React Native imports — runs under
// node:test.

export function sanitizeDigits(value: string, maxLength: number): string {
  return value.replace(/[^0-9]/g, '').slice(0, maxLength);
}

// Returns the ISO date string once all segments form a real calendar date;
// null while incomplete or impossible (e.g. 31.02.).
export function composeBirthDate(day: string, month: string, year: string): string | null {
  if (day.length < 1 || month.length < 1 || year.length !== 4) return null;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  const candidate = new Date(Date.UTC(y, m - 1, d));
  if (candidate.getUTCFullYear() !== y || candidate.getUTCMonth() !== m - 1 || candidate.getUTCDate() !== d) return null;
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return iso;
}

// Age in completed years on the given reference date (defaults to now).
export function ageOn(isoBirthDate: string, reference: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoBirthDate);
  if (!match) return null;
  const canonical = composeBirthDate(match[3]!, match[2]!, match[1]!);
  if (canonical !== isoBirthDate) return null;
  const birth = new Date(`${isoBirthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = reference.getUTCMonth() < birth.getUTCMonth()
    || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type BirthDateAssessment =
  | { kind: 'incomplete' }
  | { kind: 'invalid' }
  | { kind: 'underage'; age: number }
  | { kind: 'implausible'; age: number }
  | { kind: 'ok'; iso: string; age: number };

export function assessBirthDate(day: string, month: string, year: string, reference: Date = new Date()): BirthDateAssessment {
  if (day.length === 0 || month.length === 0 || year.length < 4) return { kind: 'incomplete' };
  const iso = composeBirthDate(day, month, year);
  if (!iso) return { kind: 'invalid' };
  const age = ageOn(iso, reference);
  if (age === null) return { kind: 'invalid' };
  if (age < 18) return { kind: 'underage', age };
  if (age > 100) return { kind: 'implausible', age };
  return { kind: 'ok', iso, age };
}
