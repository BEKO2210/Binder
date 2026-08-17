import { formatDate } from './format.ts';

export type SafetyNotice = {
  account_status: 'active' | 'suspended';
  warned: boolean;
  warning_reason: string | null;
  warned_at: string | null;
  suspended_reason: string | null;
};

export type SafetyNoticePresentation = {
  kind: 'warning' | 'suspended';
  reason: string | null;
  date: string | null;
};

export function prepareSafetyNotice(notice: SafetyNotice, locale: string): SafetyNoticePresentation | null {
  if (notice.account_status === 'suspended') {
    return { kind: 'suspended', reason: notice.suspended_reason, date: null };
  }
  if (!notice.warned) return null;
  return {
    kind: 'warning',
    reason: notice.warning_reason,
    date: notice.warned_at ? formatDate(new Date(notice.warned_at), locale) : null,
  };
}
