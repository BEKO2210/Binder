import { formatDayLabel, formatTime } from './format.ts';

// Pure presentation rules for conversation lists and the composer.
// Kept React-free so ordering and validation are independently testable.

export type ConversationPreview = {
  matchId: string;
  matchedAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

export function composerBody(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 2000 ? trimmed : null;
}

export function splitConversationPreviews<T extends ConversationPreview>(items: T[]): { newMatches: T[]; conversations: T[] } {
  const newestFirst = (left: T, right: T) => {
    const leftAt = left.lastMessageAt ?? left.matchedAt;
    const rightAt = right.lastMessageAt ?? right.matchedAt;
    return rightAt.localeCompare(leftAt) || left.matchId.localeCompare(right.matchId);
  };
  return {
    newMatches: items.filter((item) => item.lastMessageAt === null).sort(newestFirst),
    conversations: items.filter((item) => item.lastMessageAt !== null).sort((left, right) => {
      if ((left.unreadCount > 0) !== (right.unreadCount > 0)) return left.unreadCount > 0 ? -1 : 1;
      return newestFirst(left, right);
    }),
  };
}

export function previewTimeLabel(iso: string, locale: string, reference: Date = new Date()): string {
  const date = new Date(iso);
  const label = formatDayLabel(date, locale, reference);
  return label === 'today' ? formatTime(date, locale) : label;
}
