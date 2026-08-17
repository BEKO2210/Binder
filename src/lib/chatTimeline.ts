import { formatDayLabel } from './format.ts';

// Pure chat timeline shaping: bubble grouping, timestamp placement and day
// separators. No React Native imports — runs under node:test.

export type TimelineMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type TimelineItem<M extends TimelineMessage> =
  | { type: 'day'; id: string; label: string }
  | {
      type: 'message';
      id: string;
      message: M;
      // Grouped bubbles sit tight together and share a flat inner corner.
      groupedWithPrevious: boolean;
      // A block tail receives the directional corner and shared metadata.
      endsGroup: boolean;
      // The last bubble of a group carries the time caption.
      showsTimestamp: boolean;
    };

const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Day boundaries follow the DEVICE timezone — the same clock the time
// captions use — so a message after local midnight starts a new local day.
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayKey(iso: string): string {
  return localDayKey(new Date(iso));
}

// Input ascending by created_at; output ascending with day separators and
// grouping flags resolved.
export function buildChatTimeline<M extends TimelineMessage>(messages: M[], reference: Date = new Date(), locale = 'en'): TimelineItem<M>[] {
  const items: TimelineItem<M>[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;
    const previous = index > 0 ? messages[index - 1] : undefined;
    const next = index < messages.length - 1 ? messages[index + 1] : undefined;

    if (!previous || dayKey(previous.created_at) !== dayKey(message.created_at)) {
      items.push({ type: 'day', id: `day-${dayKey(message.created_at)}`, label: formatDayLabel(new Date(message.created_at), locale, reference) });
    }

    const groupedWithPrevious = Boolean(
      previous
      && previous.sender_id === message.sender_id
      && dayKey(previous.created_at) === dayKey(message.created_at)
      && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <= GROUP_WINDOW_MS,
    );
    const groupedWithNext = Boolean(
      next
      && next.sender_id === message.sender_id
      && dayKey(next.created_at) === dayKey(message.created_at)
      && new Date(next.created_at).getTime() - new Date(message.created_at).getTime() <= GROUP_WINDOW_MS,
    );

    items.push({
      type: 'message',
      id: message.id,
      message,
      groupedWithPrevious,
      endsGroup: !groupedWithNext,
      showsTimestamp: !groupedWithNext,
    });
  }
  return items;
}
