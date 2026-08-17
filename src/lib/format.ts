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
