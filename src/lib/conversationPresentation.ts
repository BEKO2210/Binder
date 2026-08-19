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

/**
 * Whether the conversation still needs a connection notice of its own.
 *
 * Sending in airplane mode put the same sentence on screen twice: once beside
 * the message that did not go out, with its retry, and once again as a banner
 * above the composer, with a second retry. Both described one lost connection.
 *
 * The message that failed is the more specific of the two and keeps its line;
 * the banner only speaks when it has something else to say.
 */
export function shouldShowConnectionNotice(
  connectionErrorKind: string | null,
  failedAttemptKinds: readonly string[],
): boolean {
  if (!connectionErrorKind) return false;
  return !failedAttemptKinds.includes(connectionErrorKind);
}
