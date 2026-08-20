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

/**
 * Which surface a conversation problem belongs on.
 *
 * A realtime channel that dropped for a moment painted the full-screen
 * "Unterhaltung konnte nicht geladen werden" over a conversation whose
 * messages were sitting right there, and the composer stayed active
 * underneath — you could write into a chat you could not see. Only a first
 * load that produced nothing may take the whole screen; a connection that
 * comes and goes is a line.
 */
export type ConversationErrorSurface = 'full-screen' | 'notice' | 'none';

export function conversationErrorSurface(input: {
  hasMessages: boolean;
  /** Messages the person wrote that have not gone out yet. They are content too. */
  hasAttempts?: boolean;
  loadFailed: boolean;
  streamFailed: boolean;
}): ConversationErrorSurface {
  const hasContent = input.hasMessages || input.hasAttempts === true;
  if (input.loadFailed && !hasContent) return 'full-screen';
  return input.loadFailed || input.streamFailed ? 'notice' : 'none';
}

/**
 * What to write beside a message that did not go out.
 *
 * A lost connection is not an error the person has to act on: the message is
 * kept and goes out by itself as soon as the conversation is reachable. Saying
 * "retry" for that is asking somebody to do the app's work. Anything the
 * server actually refused keeps its own sentence, because that one will not
 * fix itself.
 */
export function unsentMessageNote(errorKind: string | undefined): 'waiting' | 'failed' {
  return errorKind === 'offline' || errorKind === 'timeout' ? 'waiting' : 'failed';
}

/**
 * How the message list fills the space it has.
 *
 * The list renders inverted so new messages arrive at the bottom without
 * scrolling. The side effect is that a short conversation hangs from the
 * bottom edge, leaving a large hole under the header — a chat with four
 * messages looked like a chat that had lost its history. `flexGrow` plus
 * `flex-end` on an inverted list means "start at the visual top": short
 * conversations sit under the header like every other messenger, and long ones
 * are unaffected because the content is already taller than the list.
 */
export function conversationListContentStyle(padding: number): {
  padding: number;
  flexGrow: number;
  justifyContent: 'flex-end';
} {
  return { padding, flexGrow: 1, justifyContent: 'flex-end' };
}
